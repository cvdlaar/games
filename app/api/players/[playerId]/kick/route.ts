import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest, ctx: RouteContext<'/api/players/[playerId]/kick'>) {
  const supabase = await createClient()
  const { playerId } = await ctx.params
  const { host_token, reason } = await request.json()

  if (!reason?.trim()) return Response.json({ error: 'Reden is verplicht' }, { status: 400 })

  const { data: player } = await supabase.from('players').select('game_id, name').eq('id', playerId).single()
  if (!player) return Response.json({ error: 'Speler niet gevonden' }, { status: 404 })

  const { data: game } = await supabase.from('games').select('host_token').eq('id', player.game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  // Mark player inactive
  await supabase.from('players').update({ is_active: false }).eq('id', playerId)

  // Remove their location ownership
  await supabase.from('location_ownership').delete().eq('player_id', playerId)

  // Send kick event so player sees it
  await supabase.from('game_events').insert({
    game_id: player.game_id,
    type: 'player_kicked',
    player_id: playerId,
    data: { reason: reason.trim(), player_name: player.name },
  })

  return Response.json({ ok: true })
}
