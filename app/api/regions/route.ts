import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const gameId = request.nextUrl.searchParams.get('gameId')
  if (!gameId) return Response.json({ error: 'gameId required' }, { status: 400 })

  const { data } = await supabase
    .from('regions')
    .select('id, name, color, created_at')
    .eq('game_id', gameId)
    .order('created_at')

  return Response.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { host_token, game_id, name, color } = await request.json()

  const { data: game } = await supabase.from('games').select('host_token').eq('id', game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const { data, error } = await supabase
    .from('regions')
    .insert({ game_id, name: name.trim(), color: color ?? '#6366f1' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
