import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { player_id, token, subscription } = await request.json()

  const { data: player } = await supabase.from('players').select('token, config').eq('id', player_id).single()
  if (!player || player.token !== token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const config = (player.config ?? {}) as Record<string, unknown>
  await supabase.from('players').update({ config: { ...config, push_subscription: subscription } }).eq('id', player_id)

  return Response.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { player_id, token } = await request.json()

  const { data: player } = await supabase.from('players').select('token, config').eq('id', player_id).single()
  if (!player || player.token !== token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const config = (player.config ?? {}) as Record<string, unknown>
  delete config.push_subscription
  await supabase.from('players').update({ config }).eq('id', player_id)

  return Response.json({ ok: true })
}
