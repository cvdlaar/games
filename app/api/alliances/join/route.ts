import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { player_id, token, alliance_id } = await request.json()

  const { data: player } = await supabase.from('players').select('token, game_id').eq('id', player_id).single()
  if (!player || player.token !== token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  // Verify alliance belongs to same game (or alliance_id is null = leave)
  if (alliance_id) {
    const { data: al } = await supabase.from('alliances').select('game_id').eq('id', alliance_id).single()
    if (!al || al.game_id !== player.game_id) return Response.json({ error: 'Alliance not found' }, { status: 404 })
  }

  const { error } = await supabase.from('players').update({ alliance_id: alliance_id ?? null }).eq('id', player_id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
