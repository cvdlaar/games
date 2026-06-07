import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/locations/[locationId]'>) {
  const supabase = await createClient()
  const { locationId } = await ctx.params
  const body = await request.json()
  const { host_token, ...updates } = body

  const { data: location } = await supabase
    .from('locations')
    .select('game_id')
    .eq('id', locationId)
    .single()
  if (!location) return Response.json({ error: 'Not found' }, { status: 404 })

  const { data: game } = await supabase.from('games').select('host_token').eq('id', location.game_id).single()
  if (!game || game.host_token !== host_token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('locations')
    .update(updates)
    .eq('id', locationId)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/locations/[locationId]'>) {
  const supabase = await createClient()
  const { locationId } = await ctx.params
  const host_token = request.nextUrl.searchParams.get('host_token')

  const { data: location } = await supabase.from('locations').select('game_id').eq('id', locationId).single()
  if (!location) return Response.json({ error: 'Not found' }, { status: 404 })

  const { data: game } = await supabase.from('games').select('host_token').eq('id', location.game_id).single()
  if (!game || game.host_token !== host_token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { error } = await supabase.from('locations').delete().eq('id', locationId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}
