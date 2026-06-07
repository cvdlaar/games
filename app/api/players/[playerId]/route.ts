import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/players/[playerId]'>) {
  const supabase = await createClient()
  const { playerId } = await ctx.params
  const body = await request.json()
  const { token, ...updates } = body

  const { data: player } = await supabase.from('players').select('token').eq('id', playerId).single()
  if (!player || player.token !== token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const allowed = ['lat', 'lng', 'last_seen', 'is_active', 'alliance_id']
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  )
  if (Object.keys(safeUpdates).length === 0) {
    return Response.json({ error: 'No valid fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('players')
    .update(safeUpdates)
    .eq('id', playerId)
    .select('id, name, color, lat, lng, crowns, last_seen')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/players/[playerId]'>) {
  const supabase = await createClient()
  const { playerId } = await ctx.params

  const { data, error } = await supabase
    .from('players')
    .select('id, name, color, crowns, lat, lng, last_seen, alliance_id, is_active')
    .eq('id', playerId)
    .single()

  if (error) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(data)
}
