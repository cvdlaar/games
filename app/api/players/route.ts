import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateToken, PLAYER_COLORS } from '@/lib/game-logic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { game_code, name } = await request.json()

  if (!name?.trim()) return Response.json({ error: 'Name required' }, { status: 400 })

  const { data: game } = await supabase
    .from('games')
    .select('id, status, config')
    .eq('code', game_code.toUpperCase())
    .single()
  if (!game) return Response.json({ error: 'Game not found' }, { status: 404 })
  if (game.status === 'ended') return Response.json({ error: 'Game has ended' }, { status: 400 })

  const { data: existing } = await supabase
    .from('players')
    .select('color')
    .eq('game_id', game.id)
  const usedColors = (existing ?? []).map((p: { color: string }) => p.color)
  const availableColor = PLAYER_COLORS.find(c => !usedColors.includes(c)) ?? PLAYER_COLORS[0]

  const maxPlayers = (game.config as { max_players?: number })?.max_players ?? 20
  if ((existing?.length ?? 0) >= maxPlayers) {
    return Response.json({ error: 'Game is full' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('players')
    .insert({
      game_id: game.id,
      name: name.trim(),
      color: availableColor,
      token: generateToken(),
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
