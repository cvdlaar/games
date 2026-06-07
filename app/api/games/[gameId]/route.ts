import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/games/[gameId]'>) {
  const supabase = await createClient()
  const { gameId } = await ctx.params

  const { data, error } = await supabase
    .from('games')
    .select(`
      *,
      locations(*),
      players(id, name, color, alliance_id, crowns, lat, lng, last_seen, is_active),
      location_ownership(*, player:players(id, name, color))
    `)
    .eq('id', gameId)
    .single()

  if (error) return Response.json({ error: 'Game not found' }, { status: 404 })
  return Response.json(data)
}

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/games/[gameId]'>) {
  const supabase = await createClient()
  const { gameId } = await ctx.params
  const body = await request.json()
  const { host_token, ...updates } = body

  const { data: game } = await supabase.from('games').select('host_token').eq('id', gameId).single()
  if (!game || game.host_token !== host_token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const allowed = ['name', 'status', 'config', 'starts_at', 'ends_at']
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  )

  const { data, error } = await supabase
    .from('games')
    .update(safeUpdates)
    .eq('id', gameId)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
