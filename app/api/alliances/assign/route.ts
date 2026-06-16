import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Host assigns a player to an alliance (or removes them with alliance_id: null)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { host_token, game_id, player_id, alliance_id } = await request.json()

  const { data: game } = await supabase.from('games').select('host_token').eq('id', game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const { error } = await supabase.from('players').update({ alliance_id: alliance_id ?? null }).eq('id', player_id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
