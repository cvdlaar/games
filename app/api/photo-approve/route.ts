import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { host_token, game_id, event_id, approved } = await request.json()

  const { data: game } = await supabase.from('games').select('host_token').eq('id', game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const { data: event } = await supabase
    .from('game_events')
    .select('*')
    .eq('id', event_id)
    .eq('type', 'photo_pending')
    .single()
  if (!event) return Response.json({ error: 'Pending event not found' }, { status: 404 })

  const evData = event.data as Record<string, unknown>
  const location_id = evData.location_id as string
  const player_id = event.player_id as string
  const location_name = evData.location_name as string

  // Mark the pending event as processed first (idempotency guard)
  const { count: deleted } = await supabase
    .from('game_events')
    .delete({ count: 'exact' })
    .eq('id', event_id)
    .eq('type', 'photo_pending')

  // If another host already processed this event, return early
  if (!deleted || deleted === 0) {
    return Response.json({ ok: true, approved: false, skipped: true })
  }

  if (approved) {
    // Upsert ownership — handles simultaneous approvals for the same location gracefully
    await supabase
      .from('location_ownership')
      .upsert({ location_id, player_id, defense_level: 0 }, { onConflict: 'location_id' })
    await supabase.from('game_events').insert({
      game_id, type: 'photo_approved', player_id,
      data: {
        location_id,
        location_name,
        answer: evData.answer ?? '',
        photo_prompt: evData.photo_prompt ?? '',
        player_name: evData.player_name ?? '',
      },
    })
    await supabase.from('game_events').insert({
      game_id, type: 'location_claimed', player_id,
      data: { location_id, location_name, location_type: 'photo', previous_owner: null },
    })
  } else {
    await supabase.from('game_events').insert({
      game_id, type: 'photo_rejected', player_id,
      data: { location_id, location_name },
    })
  }

  return Response.json({ ok: true, approved })
}
