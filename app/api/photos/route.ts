import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const gameId = request.nextUrl.searchParams.get('gameId')
  if (!gameId) return Response.json({ error: 'gameId required' }, { status: 400 })

  const { data: events } = await supabase
    .from('game_events')
    .select('id, player_id, created_at, data, player:players(name, color, avatar)')
    .eq('game_id', gameId)
    .eq('type', 'photo_approved')
    .order('created_at', { ascending: true })

  const photos = (events ?? []).map(ev => {
    const d = ev.data as Record<string, unknown>
    const p = ev.player as unknown as { name: string; color: string; avatar?: string } | null
    return {
      id: ev.id,
      player_id: ev.player_id,
      player_name: (d.player_name as string) || p?.name || 'Onbekend',
      player_color: p?.color ?? '#888',
      player_avatar: p?.avatar ?? '🧭',
      location_name: d.location_name as string,
      photo_prompt: d.photo_prompt as string,
      answer: d.answer as string,
      created_at: ev.created_at,
    }
  })

  return Response.json(photos)
}
