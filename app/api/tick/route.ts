import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { game_id, host_token } = await request.json()

  const { data: game } = await supabase
    .from('games')
    .select('host_token, status')
    .eq('id', game_id)
    .single()

  if (!game || game.host_token !== host_token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (game.status !== 'active') {
    return Response.json({ error: 'Game not active' }, { status: 400 })
  }

  // Get all owned locations for this game with their crown values
  const { data: ownerships } = await supabase
    .from('location_ownership')
    .select('player_id, location:locations(crown_value, game_id)')
    .eq('locations.game_id', game_id)

  if (!ownerships?.length) {
    return Response.json({ paid: 0 })
  }

  // Sum crowns per player
  const payouts: Record<string, number> = {}
  for (const o of ownerships) {
    const loc = o.location as { crown_value: number; game_id: string } | null
    if (!loc || loc.game_id !== game_id) continue
    payouts[o.player_id] = (payouts[o.player_id] ?? 0) + loc.crown_value
  }

  // Update each player's crowns
  await Promise.all(
    Object.entries(payouts).map(async ([playerId, amount]) => {
      const { data: player } = await supabase
        .from('players')
        .select('crowns')
        .eq('id', playerId)
        .single()
      if (!player) return
      await supabase
        .from('players')
        .update({ crowns: player.crowns + amount })
        .eq('id', playerId)
    })
  )

  // Log the tick event
  await supabase.from('game_events').insert({
    game_id,
    type: 'crown_tick',
    data: { payouts, total_players: Object.keys(payouts).length },
  })

  return Response.json({ paid: Object.keys(payouts).length, payouts })
}
