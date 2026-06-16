import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest, ctx: RouteContext<'/api/encounters/[encounterId]/expire'>) {
  const supabase = await createClient()
  const { encounterId } = await ctx.params
  const { player_id, token } = await request.json()

  const { data: player } = await supabase.from('players').select('id, token').eq('id', player_id).single()
  if (!player || player.token !== token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const { data: encounter } = await supabase
    .from('encounters')
    .select('id, status, expires_at, initiator_id, target_id, game_id')
    .eq('id', encounterId)
    .single()

  if (!encounter) return Response.json({ error: 'Not found' }, { status: 404 })
  if (encounter.status !== 'pending') return Response.json({ ok: true })

  // Only expire if actually past expiry time
  if (new Date(encounter.expires_at) > new Date()) return Response.json({ ok: true })

  await supabase.from('encounters').update({ status: 'expired' }).eq('id', encounterId)

  await supabase.from('game_events').insert({
    game_id: encounter.game_id,
    type: 'encounter_expired',
    player_id: null,
    data: { encounter_id: encounterId, initiator_id: encounter.initiator_id, target_id: encounter.target_id },
  })

  return Response.json({ ok: true })
}
