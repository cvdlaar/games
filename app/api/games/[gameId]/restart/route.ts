import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const supabase = await createClient()
  const { gameId } = await params
  const { host_token } = await request.json()

  const { data: game } = await supabase.from('games').select('host_token, config').eq('id', gameId).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  // Reset all players to 100 crowns
  await supabase.from('players').update({ crowns: 100 }).eq('game_id', gameId)
  // Clear all ownership
  await supabase.from('location_ownership').delete().in('location_id',
    (await supabase.from('locations').select('id').eq('game_id', gameId)).data?.map(l => l.id) ?? []
  )
  // Reactivate game
  await supabase.from('games').update({ status: 'active', starts_at: new Date().toISOString(), ends_at: null }).eq('id', gameId)
  // Log event
  await supabase.from('game_events').insert({ game_id: gameId, type: 'new_round', player_id: null, data: {} })

  return Response.json({ ok: true })
}
