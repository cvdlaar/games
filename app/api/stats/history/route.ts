import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const gameId = request.nextUrl.searchParams.get('gameId')
  if (!gameId) return Response.json({ error: 'gameId required' }, { status: 400 })

  const [{ data: players }, { data: tickEvents }] = await Promise.all([
    supabase.from('players').select('id, name, color, avatar, crowns').eq('game_id', gameId),
    supabase.from('game_events')
      .select('data, created_at')
      .eq('game_id', gameId)
      .eq('type', 'crown_tick')
      .order('created_at', { ascending: true })
      .limit(200),
  ])

  if (!players || !tickEvents) return Response.json({ players: [], ticks: [] })

  // For ticks that have a `scores` snapshot, use it directly.
  // For older ticks that only have `payouts`, accumulate.
  const cumulative: Record<string, number> = {}
  for (const p of players) cumulative[p.id] = 0

  const ticks = tickEvents.map(ev => {
    const d = ev.data as Record<string, unknown>
    const scores = d.scores as Record<string, number> | undefined
    if (scores) {
      // Use snapshot
      return { timestamp: ev.created_at, scores: { ...scores } }
    }
    // Fallback: accumulate from payouts/penalties
    const payouts = (d.payouts as Record<string, number>) ?? {}
    const penalties = (d.penalties as Record<string, number>) ?? {}
    for (const pid of Object.keys(cumulative)) {
      cumulative[pid] = Math.max(0, cumulative[pid] + (payouts[pid] ?? 0) - (penalties[pid] ?? 0))
    }
    return { timestamp: ev.created_at, scores: { ...cumulative } }
  })

  return Response.json({ players, ticks })
}
