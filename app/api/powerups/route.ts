import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PowerupType, POWERUP_CONFIG } from '@/lib/types'

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { host_token, game_id, type, label, emoji, lat, lng, value, is_secret_location } = await request.json()

  const { data: game } = await supabase.from('games').select('host_token').eq('id', game_id).single()
  if (!game || game.host_token !== host_token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const config = POWERUP_CONFIG[type as PowerupType]
  const token = generateToken()

  const { data, error } = await supabase.from('powerups').insert({
    game_id, token, type,
    label: label || config.label,
    emoji: emoji || config.emoji,
    lat: lat ?? null, lng: lng ?? null,
    value: value ?? {},
    is_secret_location: is_secret_location ?? false,
  }).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const gameId = request.nextUrl.searchParams.get('gameId')
  const hostToken = request.nextUrl.searchParams.get('host_token')
  if (!gameId) return Response.json({ error: 'gameId required' }, { status: 400 })

  const { data: game } = await supabase.from('games').select('host_token').eq('id', gameId).single()
  if (!game || game.host_token !== hostToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data } = await supabase.from('powerups').select('*, claimed_player:players(name, color)').eq('game_id', gameId).order('created_at')
  return Response.json(data ?? [])
}
