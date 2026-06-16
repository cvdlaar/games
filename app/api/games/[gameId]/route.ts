import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPush } from '@/lib/push'
import type { PushSubscription as WebPushSubscription } from 'web-push'

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/games/[gameId]'>) {
  const supabase = await createClient()
  const { gameId } = await ctx.params

  const { data: game, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single()

  if (error || !game) return Response.json({ error: 'Game not found' }, { status: 404 })

  const [{ data: locations }, { data: players }, { data: ownership }] = await Promise.all([
    supabase.from('locations').select('*').eq('game_id', gameId),
    supabase.from('players').select('id, name, color, alliance_id, crowns, lat, lng, last_seen, is_active').eq('game_id', gameId),
    supabase.from('location_ownership').select('*, player:players(id, name, color)').in(
      'location_id',
      (await supabase.from('locations').select('id').eq('game_id', gameId)).data?.map(l => l.id) ?? []
    ),
  ])

  return Response.json({ ...game, locations: locations ?? [], players: players ?? [], location_ownership: ownership ?? [] })
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

  // When game goes active: stamp phase_started_at so auto-timer knows when phase 0 began
  if (safeUpdates.status === 'active') {
    const { data: currentGame } = await supabase.from('games').select('config').eq('id', gameId).single()
    const cfg = (currentGame?.config ?? {}) as Record<string, unknown>
    safeUpdates.config = { ...cfg, ...(safeUpdates.config as Record<string, unknown> ?? {}), phase_started_at: new Date().toISOString() }
  }

  // When game ends: auto-resolve all pending encounters as draw (+15 for both)
  if (safeUpdates.status === 'ended') {
    const { data: pendingEncounters } = await supabase
      .from('encounters')
      .select('id, initiator_id, target_id, game_id')
      .eq('game_id', gameId)
      .eq('status', 'pending')

    for (const enc of pendingEncounters ?? []) {
      await supabase.from('encounters').update({ status: 'resolved', winner_id: null }).eq('id', enc.id)
      const [{ data: init }, { data: targ }] = await Promise.all([
        supabase.from('players').select('crowns').eq('id', enc.initiator_id).single(),
        supabase.from('players').select('crowns').eq('id', enc.target_id).single(),
      ])
      await Promise.all([
        supabase.from('players').update({ crowns: (init?.crowns ?? 0) + 15 }).eq('id', enc.initiator_id),
        supabase.from('players').update({ crowns: (targ?.crowns ?? 0) + 15 }).eq('id', enc.target_id),
      ])
      await supabase.from('game_events').insert({
        game_id: enc.game_id, type: 'encounter_resolved', player_id: null,
        data: { encounter_id: enc.id, initiator_id: enc.initiator_id, target_id: enc.target_id, initiator_choice: 'trade', target_choice: 'trade', winner_id: null, auto_resolved: true },
      })
    }

    // Push notification to all active players
    const { data: allPlayers } = await supabase.from('players').select('config').eq('game_id', gameId).eq('is_active', true)
    for (const p of allPlayers ?? []) {
      const sub = (p.config as Record<string, unknown> | null)?.push_subscription as WebPushSubscription | undefined
      if (sub) sendPush(sub, { title: '🏁 Spel voorbij!', body: 'Het spel is afgelopen — bekijk de eindstand!', tag: 'game-end' }).catch(() => {})
    }
  }

  const { data, error } = await supabase
    .from('games')
    .update(safeUpdates)
    .eq('id', gameId)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
