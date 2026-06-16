import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDistanceMeters } from '@/lib/game-logic'
import { ChallengeData } from '@/lib/types'
import { sendPush } from '@/lib/push'
import type { PushSubscription as WebPushSubscription } from 'web-push'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { player_id, token, location_id, player_lat, player_lng, challenge_answer } = await request.json()

  const { data: player } = await supabase.from('players').select('*').eq('id', player_id).single()
  if (!player || player.token !== token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const { data: location } = await supabase.from('locations').select('*').eq('id', location_id).single()
  if (!location) return Response.json({ error: 'Location not found' }, { status: 404 })

  const { data: game } = await supabase.from('games').select('status').eq('id', location.game_id).single()
  if (game?.status !== 'active') return Response.json({ error: 'Game is not active' }, { status: 400 })

  const distance = getDistanceMeters(player_lat, player_lng, location.lat, location.lng)
  if (distance > location.claim_radius) {
    return Response.json({ error: `Te ver weg (${Math.round(distance)}m, max ${location.claim_radius}m)` }, { status: 400 })
  }

  const { data: currentOwner } = await supabase
    .from('location_ownership')
    .select('*, player:players(id, name, crowns)')
    .eq('location_id', location_id)
    .single()

  if (currentOwner?.player_id === player_id) {
    return Response.json({ error: 'Je bezit deze locatie al' }, { status: 400 })
  }

  // Base locations are permanent once claimed — cannot be taken
  if (location.type === 'base' && currentOwner) {
    return Response.json({ error: '🏰 Deze burcht is permanent bezet. Burchten kunnen niet worden ingenomen.' }, { status: 400 })
  }

  // Photo challenge: don't auto-approve — create pending event for host review
  if (location.challenge_type === 'photo') {
    const { error: photoInsertErr } = await supabase.from('game_events').insert({
      game_id: location.game_id,
      type: 'photo_pending',
      player_id,
      data: {
        location_id,
        location_name: location.name,
        player_name: player.name,
        photo_prompt: (location.challenge_data as ChallengeData).photo_prompt ?? '',
        answer: challenge_answer ?? '',
      },
    })
    if (photoInsertErr) return Response.json({ error: `Kon inzending niet opslaan: ${photoInsertErr.message}` }, { status: 500 })
    return Response.json({ success: true, pending: true, location_name: location.name, message: 'Ingediend! Wacht op goedkeuring van de host.' })
  }

  const challengeOk = validateChallenge(location.challenge_type, location.challenge_data as ChallengeData, challenge_answer)
  if (!challengeOk) return Response.json({ error: 'Antwoord onjuist', hint: 'Probeer opnieuw!' }, { status: 400 })

  if (currentOwner) {
    const defenderPlayerId = currentOwner.player_id as string

    // Check shield buff on defender
    const now = new Date().toISOString()
    const { data: shieldBuff } = await supabase
      .from('player_buffs')
      .select('id')
      .eq('player_id', defenderPlayerId)
      .eq('type', 'shield')
      .gt('expires_at', now)
      .limit(1)
      .maybeSingle()

    if (shieldBuff) {
      return Response.json({ error: '🛡️ Deze locatie is beschermd door een schild! Probeer het later opnieuw.' }, { status: 400 })
    }

    // Barracks bonus: check if defender owns a barracks within 500m
    const { data: nearbyOwned } = await supabase
      .from('location_ownership')
      .select('location:locations(lat, lng, type)')
      .eq('player_id', defenderPlayerId)
      .neq('location_id', location_id)

    let barracksBonus = 0
    for (const o of nearbyOwned ?? []) {
      const l = o.location as unknown as { lat: number; lng: number; type: string } | null
      if (!l || l.type !== 'barracks') continue
      if (getDistanceMeters(location.lat, location.lng, l.lat, l.lng) < 500) {
        barracksBonus = 1
        break
      }
    }

    const effectiveDefense = currentOwner.defense_level + barracksBonus
    const captureBonus = barracksBonus > 0 ? ` (+1 kazerne bonus → niveau ${effectiveDefense})` : ''
    const upgradeCost = [0, 50, 150, 300][Math.min(effectiveDefense, 3)] ?? 300

    if (upgradeCost > 0) {
      if (player.crowns < upgradeCost) {
        return Response.json({
          error: `Versterkt (niveau ${effectiveDefense}${captureBonus}). Je hebt ${upgradeCost} 👑 nodig om te veroveren.`,
        }, { status: 400 })
      }
      await supabase.from('players').update({ crowns: player.crowns - upgradeCost }).eq('id', player_id)
    }
    await supabase.from('location_ownership').delete().eq('location_id', location_id)
  }

  const initialDefense = player.strategy === 'verdediger' ? 1 : 0
  const { error: ownerError } = await supabase
    .from('location_ownership')
    .insert({ location_id, player_id, defense_level: initialDefense })

  // Unique constraint violation = another player claimed simultaneously
  if (ownerError) {
    if (ownerError.code === '23505') {
      return Response.json({ error: 'Te laat — iemand anders heeft deze locatie net veroverd!' }, { status: 409 })
    }
    return Response.json({ error: ownerError.message }, { status: 500 })
  }

  // Push notification to previous owner
  if (currentOwner) {
    const { data: prevOwnerData } = await supabase.from('players').select('config').eq('id', currentOwner.player_id).single()
    const sub = (prevOwnerData?.config as Record<string, unknown> | null)?.push_subscription as WebPushSubscription | undefined
    if (sub) sendPush(sub, { title: '🏴 Locatie veroverd!', body: `${player.name} heeft ${location.name} ingenomen`, tag: 'claim' }).catch(() => {})
  }

  // Veroveraar strategy bonus: +10 crowns per claim
  if (player.strategy === 'veroveraar') {
    const { data: freshP } = await supabase.from('players').select('crowns').eq('id', player_id).single()
    await supabase.from('players').update({ crowns: (freshP?.crowns ?? 0) + 10 }).eq('id', player_id)
  }

  // Homebase first-claim bonus: +50 crowns for first team to claim a base
  let homebaseCrowns = 0
  if (location.type === 'base' && !currentOwner) {
    homebaseCrowns = 50
    const { data: freshP } = await supabase.from('players').select('crowns').eq('id', player_id).single()
    await supabase.from('players').update({ crowns: (freshP?.crowns ?? 0) + homebaseCrowns }).eq('id', player_id)
    await supabase.from('game_events').insert({
      game_id: location.game_id, type: 'crown_bonus', player_id,
      data: { amount: homebaseCrowns, reason: 'Burcht ingenomen' },
    })
  }

  // Bonus mission: check if there's an active bonus_mission for this location
  const nowCheck = new Date().toISOString()
  const { data: bonusMission } = await supabase
    .from('admin_events')
    .select('id, value')
    .eq('game_id', location.game_id)
    .eq('type', 'bonus_mission')
    .eq('active', true)
    .is('expires_at', null)
    .limit(1)
    .maybeSingle()
  let bonusCrowns = 0
  if (bonusMission) {
    const missionValue = bonusMission.value as { location_id?: string; bonus_crowns?: number }
    if (missionValue.location_id === location_id) {
      bonusCrowns = missionValue.bonus_crowns ?? 100
      await supabase.from('players').update({ crowns: player.crowns + bonusCrowns }).eq('id', player_id)
      await supabase.from('admin_events').update({ active: false, expires_at: nowCheck }).eq('id', bonusMission.id)
      await supabase.from('game_events').insert({
        game_id: location.game_id, type: 'bonus_mission_won', player_id,
        data: { location_id, location_name: location.name, bonus_crowns: bonusCrowns },
      })
    }
  }

  await supabase.from('game_events').insert({
    game_id: location.game_id,
    type: 'location_claimed',
    player_id,
    data: {
      location_id,
      location_name: location.name,
      location_type: location.type,
      previous_owner: currentOwner?.player_id ?? null,
      attacker_name: player.name,
      attacker_strategy: player.strategy ?? null,
    },
  })

  return Response.json({ success: true, location_name: location.name, location_type: location.type, bonus_crowns: bonusCrowns + homebaseCrowns })
}

function validateChallenge(type: string, data: ChallengeData, answer: string | null): boolean {
  if (type === 'checkin') return true
  if (!answer) return false
  if (type === 'quiz' || type === 'puzzle') {
    return answer.trim().toLowerCase() === (data.answer ?? '').trim().toLowerCase()
  }
  if (type === 'photo' || type === 'timed') return true
  return false
}
