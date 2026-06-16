import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PowerupType, POWERUP_CONFIG } from '@/lib/types'

const BUFF_DURATION_MINUTES: Partial<Record<PowerupType, number>> = {
  double_income: 10,
  shield: 5,
  reveal_all: 5,
  secret_location: 5,
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { token, player_id, player_token } = await request.json()
  if (!token || !player_id) return Response.json({ error: 'token and player_id required' }, { status: 400 })

  const { data: player } = await supabase.from('players').select('id, name, game_id, crowns, token').eq('id', player_id).single()
  if (!player || player.token !== player_token) return Response.json({ error: 'Ongeldig speler token' }, { status: 403 })

  const { data: powerup } = await supabase.from('powerups').select('*').eq('token', token).eq('game_id', player.game_id).single()
  if (!powerup) return Response.json({ error: 'Powerup niet gevonden of niet in jouw spel' }, { status: 404 })
  if (powerup.claimed_by) return Response.json({ label: powerup.label, emoji: powerup.emoji, message: 'Al geclaimd' }, { status: 409 })

  // Mark as claimed
  await supabase.from('powerups').update({ claimed_by: player_id, claimed_at: new Date().toISOString() }).eq('id', powerup.id)

  const type = powerup.type as PowerupType
  const config = POWERUP_CONFIG[type]
  let message = `Je hebt "${powerup.label}" geclaimd!`

  // Apply effect
  if (type === 'crowns_bonus') {
    const amount = (powerup.value as { amount?: number }).amount ?? 50
    await supabase.from('players').update({ crowns: player.crowns + amount }).eq('id', player_id)
    await supabase.from('game_events').insert({ game_id: player.game_id, type: 'powerup_claimed', player_id, data: { powerup_type: type, amount, label: powerup.label } })
    message = `+${amount} Kronen!`
  } else if (type === 'steal') {
    // Steal from nearest active player with a known position
    const { data: others } = await supabase.from('players').select('id, name, crowns, lat, lng').eq('game_id', player.game_id).neq('id', player_id).eq('is_active', true)
    const { data: me } = await supabase.from('players').select('lat, lng').eq('id', player_id).single()
    let victim: { id: string; name: string; crowns: number } | null = null
    if (others && me?.lat && me?.lng) {
      let minDist = Infinity
      for (const o of others) {
        if (!o.lat || !o.lng) continue
        const d = Math.hypot(o.lat - me.lat, o.lng - me.lng)
        if (d < minDist) { minDist = d; victim = o }
      }
    }
    if (!victim && others && others.length > 0) {
      // fallback: richest if no positions known
      victim = others.sort((a, b) => b.crowns - a.crowns)[0]
    }
    if (victim) {
      const stolen = Math.floor(victim.crowns * 0.15)
      await supabase.from('players').update({ crowns: victim.crowns - stolen }).eq('id', victim.id)
      await supabase.from('players').update({ crowns: player.crowns + stolen }).eq('id', player_id)
      message = `Gestolen: +${stolen} Kronen van ${victim.name}!`
    }
    await supabase.from('game_events').insert({ game_id: player.game_id, type: 'powerup_claimed', player_id, data: { powerup_type: type, label: powerup.label } })
  } else if (type === 'crown_rain') {
    // Give 20 crowns to every player
    const { data: allPlayers } = await supabase.from('players').select('id, crowns').eq('game_id', player.game_id)
    if (allPlayers) {
      for (const p of allPlayers) {
        await supabase.from('players').update({ crowns: p.crowns + 20 }).eq('id', p.id)
      }
    }
    await supabase.from('game_events').insert({ game_id: player.game_id, type: 'crown_rain', player_id, data: { label: powerup.label } })
    message = 'Kronenregen! Alle spelers krijgen 20 Kronen!'
  } else if (BUFF_DURATION_MINUTES[type]) {
    // Time-based buff
    const minutes = BUFF_DURATION_MINUTES[type]!
    const expires_at = new Date(Date.now() + minutes * 60 * 1000).toISOString()

    // Secret location: include unclaimed powerup positions in buff value so client can show them
    let buffValue: Record<string, unknown> = powerup.value as Record<string, unknown>
    if (type === 'secret_location') {
      const { data: hiddenPowerups } = await supabase
        .from('powerups')
        .select('id, emoji, label, lat, lng')
        .eq('game_id', player.game_id)
        .is('claimed_by', null)
        .not('lat', 'is', null)
      buffValue = { ...buffValue, powerup_locations: hiddenPowerups ?? [] }
      message = `🗝️ Geheime locaties zichtbaar voor ${minutes} min!`
    }

    await supabase.from('player_buffs').insert({ player_id, game_id: player.game_id, type, value: buffValue, expires_at })
    await supabase.from('game_events').insert({ game_id: player.game_id, type: 'powerup_claimed', player_id, data: { powerup_type: type, label: powerup.label, minutes } })
    if (type !== 'secret_location') message = `${config.label} actief voor ${minutes} minuten!`
  }

  return Response.json({ label: powerup.label, emoji: powerup.emoji, type: powerup.type, message })
}
