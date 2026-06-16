import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateToken, PLAYER_COLORS } from '@/lib/game-logic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { game_code, name, avatar, color: requestedColor, strategy } = await request.json()

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
    .select('id, color, name, token, avatar')
    .eq('game_id', game.id)

  // Rejoin: same name already exists — return existing player with new token
  const sameNamePlayer = (existing ?? []).find((p: { name: string }) => p.name.toLowerCase() === name.trim().toLowerCase())
  if (sameNamePlayer) {
    const newToken = generateToken()
    const updatePayload: Record<string, unknown> = { token: newToken, is_active: true }
    if (requestedColor) updatePayload.color = requestedColor
    const { data: updated } = await supabase
      .from('players')
      .update(updatePayload)
      .eq('id', sameNamePlayer.id)
      .select()
      .single()
    return Response.json(updated ?? { ...sameNamePlayer, token: newToken }, { status: 200 })
  }

  const usedColors = (existing ?? []).map((p: { color: string }) => p.color)
  const availableColor = requestedColor ?? PLAYER_COLORS.find(c => !usedColors.includes(c)) ?? PLAYER_COLORS[0]

  const maxPlayers = (game.config as { max_players?: number })?.max_players ?? 20
  if ((existing?.length ?? 0) >= maxPlayers) {
    return Response.json({ error: 'Game is full' }, { status: 400 })
  }

  // Try with avatar first, fall back without if column missing
  const insertData: Record<string, unknown> = {
    game_id: game.id,
    name: name.trim(),
    color: availableColor,
    token: generateToken(),
  }

  if (strategy) insertData.strategy = strategy

  const { data: withAvatar, error: avatarError } = await supabase
    .from('players')
    .insert({ ...insertData, avatar: avatar ?? '🧭' })
    .select()
    .single()

  if (!avatarError) return Response.json(withAvatar, { status: 201 })

  // avatar column doesn't exist yet (schema-v3 not run)
  const { data, error } = await supabase.from('players').insert(insertData).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ...data, avatar: avatar ?? '🧭' }, { status: 201 })
}
