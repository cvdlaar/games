import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDistanceMeters } from '@/lib/game-logic'
import { ChallengeData } from '@/lib/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { player_id, token, location_id, player_lat, player_lng, challenge_answer } = await request.json()

  const { data: player } = await supabase.from('players').select('*').eq('id', player_id).single()
  if (!player || player.token !== token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data: location } = await supabase.from('locations').select('*').eq('id', location_id).single()
  if (!location) return Response.json({ error: 'Location not found' }, { status: 404 })

  const { data: game } = await supabase.from('games').select('status').eq('id', location.game_id).single()
  if (game?.status !== 'active') {
    return Response.json({ error: 'Game is not active' }, { status: 400 })
  }

  const distance = getDistanceMeters(player_lat, player_lng, location.lat, location.lng)
  if (distance > location.claim_radius) {
    return Response.json({ error: `Too far away (${Math.round(distance)}m, need ${location.claim_radius}m)` }, { status: 400 })
  }

  const { data: currentOwner } = await supabase
    .from('location_ownership')
    .select('*, player:players(id, name)')
    .eq('location_id', location_id)
    .single()

  if (currentOwner?.player_id === player_id) {
    return Response.json({ error: 'You already own this location' }, { status: 400 })
  }

  const challengeOk = validateChallenge(location.challenge_type, location.challenge_data as ChallengeData, challenge_answer)
  if (!challengeOk) {
    return Response.json({ error: 'Challenge answer incorrect', hint: 'Try again!' }, { status: 400 })
  }

  if (currentOwner) {
    const upgradeCost = currentOwner.defense_level * 50
    if (upgradeCost > 0) {
      if (player.crowns < upgradeCost) {
        return Response.json({
          error: `This location is fortified (level ${currentOwner.defense_level}). You need ${upgradeCost} crowns to capture it.`,
        }, { status: 400 })
      }
      await supabase.from('players').update({ crowns: player.crowns - upgradeCost }).eq('id', player_id)
    }
    await supabase.from('location_ownership').delete().eq('location_id', location_id)
  }

  const { error: ownerError } = await supabase
    .from('location_ownership')
    .insert({ location_id, player_id, defense_level: 0 })

  if (ownerError) return Response.json({ error: ownerError.message }, { status: 500 })

  await supabase.from('game_events').insert({
    game_id: location.game_id,
    type: 'location_claimed',
    player_id,
    data: {
      location_id,
      location_name: location.name,
      location_type: location.type,
      previous_owner: currentOwner?.player_id ?? null,
    },
  })

  return Response.json({ success: true, location_name: location.name, location_type: location.type })
}

function validateChallenge(type: string, data: ChallengeData, answer: string | null): boolean {
  if (type === 'checkin') return true
  if (!answer) return false
  if (type === 'quiz') {
    return answer.trim().toLowerCase() === (data.answer ?? '').trim().toLowerCase()
  }
  if (type === 'photo') return true
  if (type === 'timed') return true
  if (type === 'puzzle') {
    return answer.trim().toLowerCase() === (data.answer ?? '').trim().toLowerCase()
  }
  return false
}
