import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get('gameId')
  const hostToken = req.nextUrl.searchParams.get('host_token')
  const type = req.nextUrl.searchParams.get('type')
  if (!gameId || !hostToken) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const supabase = await createClient()
  const { data: game } = await supabase.from('games').select('host_token').eq('id', gameId).single()
  if (!game || game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let query = supabase.from('game_events').select('*').eq('game_id', gameId).order('created_at', { ascending: false }).limit(50)
  if (type) query = query.eq('type', type)

  const { data } = await query
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { host_token, game_id, type, data } = await req.json()
  if (!host_token || !game_id || !type) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const supabase = await createClient()
  const { data: game } = await supabase.from('games').select('host_token').eq('id', game_id).single()
  if (!game || game.host_token !== host_token) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { error } = await supabase.from('game_events').insert({ game_id, type, player_id: null, data: data ?? {} })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
