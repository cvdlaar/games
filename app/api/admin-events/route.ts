import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPush } from '@/lib/push'
import type { PushSubscription as WebPushSubscription } from 'web-push'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const gameId = request.nextUrl.searchParams.get('gameId')
  const hostToken = request.nextUrl.searchParams.get('host_token')
  if (!gameId) return Response.json({ error: 'gameId required' }, { status: 400 })

  const { data: game } = await supabase.from('games').select('host_token').eq('id', gameId).single()
  if (!game || game.host_token !== hostToken) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const { data } = await supabase.from('admin_events').select('*').eq('game_id', gameId).order('created_at', { ascending: false })
  return Response.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { host_token, game_id, type, title, description, value, expires_minutes, target_player_id } = await request.json()

  const { data: game } = await supabase.from('games').select('host_token').eq('id', game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const expires_at = expires_minutes ? new Date(Date.now() + expires_minutes * 60 * 1000).toISOString() : null

  const { data, error } = await supabase.from('admin_events').insert({
    game_id, type, title, description: description ?? '', value: value ?? {}, expires_at,
    ...(target_player_id ? { target_player_id } : {}),
  }).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Broadcast: insert game_event for realtime pickup by players
  await supabase.from('game_events').insert({
    game_id,
    type: 'admin_event',
    player_id: null,
    data: { event_type: type, title, description: description ?? '', value: value ?? {}, ...(target_player_id ? { target_player_id } : {}) }
  })

  // Immediate effects
  if (type === 'storm') {
    // Clear all location ownership via location IDs (location_ownership has no game_id column)
    const { data: gameLocs } = await supabase.from('locations').select('id').eq('game_id', game_id)
    const locIds = (gameLocs ?? []).map(l => l.id)
    if (locIds.length > 0) await supabase.from('location_ownership').delete().in('location_id', locIds)
    await supabase.from('game_events').insert({ game_id, type: 'storm', player_id: null, data: { title } })
  } else if (type === 'crown_rain') {
    const amount = (value as { amount?: number })?.amount ?? 30
    const { data: players } = await supabase.from('players').select('id, crowns').eq('game_id', game_id)
    if (players) {
      for (const p of players) {
        await supabase.from('players').update({ crowns: p.crowns + amount }).eq('id', p.id)
      }
    }
  } else if (type === 'bonus_mission') {
    const reward = (value as { reward?: number })?.reward ?? 50
    if (target_player_id) {
      const { data: tp } = await supabase.from('players').select('crowns').eq('id', target_player_id).single()
      if (tp) {
        await supabase.from('players').update({ crowns: tp.crowns + reward }).eq('id', target_player_id)
        await supabase.from('game_events').insert({
          game_id, type: 'crown_bonus', player_id: target_player_id,
          data: { amount: reward, reason: title ?? 'Bonusmissie' },
        })
      }
    }
  }

  // Push to targeted player (announcement) or all players (broadcast events)
  const pushTitle = type === 'announcement' ? `📡 ${title}` : type === 'storm' ? '⛈ Storm!' : type === 'crown_rain' ? '👑 Kronenregen!' : null
  if (pushTitle) {
    const pushBody = description || title
    if (target_player_id) {
      const { data: tp } = await supabase.from('players').select('config').eq('id', target_player_id).single()
      const sub = (tp?.config as Record<string, unknown> | null)?.push_subscription as WebPushSubscription | undefined
      if (sub) sendPush(sub, { title: pushTitle, body: pushBody, tag: 'admin' }).catch(() => {})
    } else {
      const { data: allPlayers } = await supabase.from('players').select('config').eq('game_id', game_id).eq('is_active', true)
      for (const p of allPlayers ?? []) {
        const sub = (p.config as Record<string, unknown> | null)?.push_subscription as WebPushSubscription | undefined
        if (sub) sendPush(sub, { title: pushTitle, body: pushBody, tag: 'admin' }).catch(() => {})
      }
    }
  }

  return Response.json(data, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { host_token, game_id, event_id } = await request.json()

  const { data: game } = await supabase.from('games').select('host_token').eq('id', game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  await supabase.from('admin_events').update({ active: false }).eq('id', event_id)
  return Response.json({ ok: true })
}
