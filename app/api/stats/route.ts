import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const gameId = request.nextUrl.searchParams.get('gameId')
  if (!gameId) return Response.json({ error: 'gameId required' }, { status: 400 })

  const [{ data: players }, { data: statsRows }, { data: claimEvents }] = await Promise.all([
    supabase.from('players').select('id, name, color, crowns').eq('game_id', gameId).order('crowns', { ascending: false }),
    supabase.from('player_stats').select('player_id, distance_meters').eq('game_id', gameId),
    supabase.from('game_events').select('player_id, type').eq('game_id', gameId).in('type', ['location_claimed', 'powerup_claimed']),
  ])

  const distanceByPlayer: Record<string, number> = {}
  for (const s of statsRows ?? []) distanceByPlayer[s.player_id] = s.distance_meters ?? 0

  const claimsByPlayer: Record<string, { claimed: number; powerups: number }> = {}
  for (const ev of claimEvents ?? []) {
    if (!ev.player_id) continue
    if (!claimsByPlayer[ev.player_id]) claimsByPlayer[ev.player_id] = { claimed: 0, powerups: 0 }
    if (ev.type === 'location_claimed') claimsByPlayer[ev.player_id].claimed++
    if (ev.type === 'powerup_claimed') claimsByPlayer[ev.player_id].powerups++
  }

  const enriched = (players ?? []).map(p => ({
    player_id: p.id,
    player: { name: p.name, color: p.color, crowns: p.crowns },
    distance_meters: distanceByPlayer[p.id] ?? 0,
    locations_claimed: claimsByPlayer[p.id]?.claimed ?? 0,
    powerups_found: claimsByPlayer[p.id]?.powerups ?? 0,
  }))

  // Sort: most distance first
  enriched.sort((a, b) => b.distance_meters - a.distance_meters)

  return Response.json(enriched)
}
