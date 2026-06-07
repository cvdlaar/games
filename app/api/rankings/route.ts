import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const gameId = request.nextUrl.searchParams.get('gameId')
  if (!gameId) return Response.json({ error: 'gameId required' }, { status: 400 })

  const [{ data: players }, { data: ownerships }] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, color, crowns, is_active')
      .eq('game_id', gameId)
      .eq('is_active', true),
    supabase
      .from('location_ownership')
      .select('player_id, location:locations(crown_value, type)')
      .eq('locations.game_id', gameId),
  ])

  const locationCountByPlayer: Record<string, number> = {}
  const crownValueByPlayer: Record<string, number> = {}

  for (const o of ownerships ?? []) {
    const pid = o.player_id
    locationCountByPlayer[pid] = (locationCountByPlayer[pid] ?? 0) + 1
    const cv = (o.location as { crown_value: number } | null)?.crown_value ?? 0
    crownValueByPlayer[pid] = (crownValueByPlayer[pid] ?? 0) + cv
  }

  const ranked = (players ?? [])
    .map(p => ({
      ...p,
      location_count: locationCountByPlayer[p.id] ?? 0,
      crown_income: crownValueByPlayer[p.id] ?? 0,
      score: p.crowns + (locationCountByPlayer[p.id] ?? 0) * 50,
    }))
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ ...p, rank: i + 1 }))

  return Response.json(ranked)
}
