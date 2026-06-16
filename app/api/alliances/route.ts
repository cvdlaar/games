import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: list alliances for a game (public, players can read)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const gameId = request.nextUrl.searchParams.get('gameId')
  if (!gameId) return Response.json({ error: 'gameId required' }, { status: 400 })

  const { data } = await supabase.from('alliances').select('*').eq('game_id', gameId)
  return Response.json(data ?? [])
}

// POST: host creates an alliance
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { host_token, game_id, name, color } = await request.json()

  const { data: game } = await supabase.from('games').select('host_token').eq('id', game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const { data, error } = await supabase.from('alliances').insert({ game_id, name, color }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}

// DELETE: host removes an alliance (and clears players from it)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { host_token, game_id, alliance_id } = await request.json()

  const { data: game } = await supabase.from('games').select('host_token').eq('id', game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  await supabase.from('players').update({ alliance_id: null }).eq('alliance_id', alliance_id)
  await supabase.from('alliances').delete().eq('id', alliance_id)
  return Response.json({ ok: true })
}
