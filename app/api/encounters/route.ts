import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDistanceMeters } from '@/lib/game-logic'

const ENCOUNTER_RADIUS = 50

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { initiator_id, token, target_id } = await request.json()

  const { data: initiator } = await supabase.from('players').select('*').eq('id', initiator_id).single()
  if (!initiator || initiator.token !== token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data: target } = await supabase.from('players').select('*').eq('id', target_id).single()
  if (!target) return Response.json({ error: 'Target not found' }, { status: 404 })

  if (initiator.game_id !== target.game_id) {
    return Response.json({ error: 'Different games' }, { status: 400 })
  }

  if (!initiator.lat || !target.lat) {
    return Response.json({ error: 'Location unknown' }, { status: 400 })
  }

  const distance = getDistanceMeters(initiator.lat, initiator.lng, target.lat, target.lng)
  if (distance > ENCOUNTER_RADIUS) {
    return Response.json({ error: `Too far (${Math.round(distance)}m)` }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('encounters')
    .select('id')
    .or(`initiator_id.eq.${initiator_id},target_id.eq.${initiator_id}`)
    .eq('status', 'pending')
    .single()
  if (existing) {
    return Response.json({ error: 'Already in an encounter' }, { status: 400 })
  }

  const expiresAt = new Date(Date.now() + 45_000).toISOString()
  const { data, error } = await supabase
    .from('encounters')
    .insert({
      game_id: initiator.game_id,
      initiator_id,
      target_id,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const playerId = request.nextUrl.searchParams.get('playerId')
  if (!playerId) return Response.json({ error: 'playerId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('encounters')
    .select('*, initiator:players!initiator_id(id, name, color), target:players!target_id(id, name, color)')
    .or(`initiator_id.eq.${playerId},target_id.eq.${playerId}`)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data?.[0] ?? null)
}
