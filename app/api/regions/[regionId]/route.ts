import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ regionId: string }> }) {
  const supabase = await createClient()
  const { regionId } = await params
  const { host_token, name, color } = await request.json()

  const { data: region } = await supabase.from('regions').select('game_id').eq('id', regionId).single()
  if (!region) return Response.json({ error: 'Not found' }, { status: 404 })
  const { data: game } = await supabase.from('games').select('host_token').eq('id', region.game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const updates: Record<string, string> = {}
  if (name) updates.name = name.trim()
  if (color) updates.color = color

  const { data, error } = await supabase.from('regions').update(updates).eq('id', regionId).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ regionId: string }> }) {
  const supabase = await createClient()
  const { regionId } = await params
  const { host_token } = await request.json()

  const { data: region } = await supabase.from('regions').select('game_id').eq('id', regionId).single()
  if (!region) return Response.json({ error: 'Not found' }, { status: 404 })
  const { data: game } = await supabase.from('games').select('host_token').eq('id', region.game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  // Unlink all locations in this region first
  await supabase.from('locations').update({ region_id: null }).eq('region_id', regionId)
  await supabase.from('regions').delete().eq('id', regionId)
  return Response.json({ ok: true })
}
