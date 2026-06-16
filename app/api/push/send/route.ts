import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPush } from '@/lib/push'
import type webpush from 'web-push'

// Internal route — caller must be server-side (same origin or service role)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { player_id, payload } = await request.json()

  const { data: player } = await supabase.from('players').select('config').eq('id', player_id).single()
  const sub = (player?.config as Record<string, unknown> | null)?.push_subscription as webpush.PushSubscription | undefined
  if (!sub) return Response.json({ ok: false, reason: 'no_subscription' })

  await sendPush(sub, payload)
  return Response.json({ ok: true })
}
