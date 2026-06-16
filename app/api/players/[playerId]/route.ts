import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDistanceMeters } from '@/lib/game-logic'

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/players/[playerId]'>) {
  const supabase = await createClient()
  const { playerId } = await ctx.params
  const body = await request.json()
  const { token, ...updates } = body

  const { data: player } = await supabase.from('players').select('token, lat, lng, game_id, crowns').eq('id', playerId).single()
  if (!player || player.token !== token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Track distance if GPS update
  if (updates.lat && updates.lng && player.lat && player.lng) {
    const meters = getDistanceMeters(player.lat, player.lng, updates.lat, updates.lng)
    // Only count if movement > 5m (filter GPS noise) and < 500m (filter teleports)
    if (meters > 5 && meters < 500) {
      try {
        await supabase.from('player_stats').upsert({
          player_id: playerId,
          game_id: player.game_id,
          distance_meters: meters,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'player_id,game_id', ignoreDuplicates: false })
        const { data: existing } = await supabase.from('player_stats').select('distance_meters').eq('player_id', playerId).eq('game_id', player.game_id).single()
        if (existing) {
          const prevTotal = existing.distance_meters
          const newTotal = prevTotal + meters
          await supabase.from('player_stats').update({ distance_meters: newTotal, updated_at: new Date().toISOString() }).eq('player_id', playerId).eq('game_id', player.game_id)

          // Distance milestone: every 1000m walked → double_income buff for 5 min
          const MILESTONE = 1000
          const prevMilestone = Math.floor(prevTotal / MILESTONE)
          const newMilestone = Math.floor(newTotal / MILESTONE)
          if (newMilestone > prevMilestone) {
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
            await supabase.from('player_buffs').insert({
              player_id: playerId,
              game_id: player.game_id,
              type: 'double_income',
              expires_at: expiresAt,
            }).then(() => {}, () => {})
            await supabase.from('game_events').insert({
              game_id: player.game_id,
              type: 'milestone_reached',
              player_id: playerId,
              data: { milestone_km: newMilestone, buff: 'double_income', message: `🚶 ${newMilestone} km gelopen! Dubbele inkomsten voor 5 min.` },
            }).then(() => {}, () => {})
          }
        }
      } catch { /* graceful if table doesn't exist yet */ }
    }
  }

  // Outpost warning: if updated position is within 100m of an enemy outpost, notify owner
  if (updates.lat && updates.lng) {
    try {
      const { data: outpostOwnerships } = await supabase
        .from('location_ownership')
        .select('player_id, location:locations(id, name, lat, lng, type)')
        .eq('locations.game_id', player.game_id)
        .eq('locations.type', 'outpost')
        .neq('player_id', playerId)
      const OUTPOST_WARN_RADIUS = 100
      const COOLDOWN_SECONDS = 120
      const cooldownCutoff = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString()
      for (const o of outpostOwnerships ?? []) {
        const loc = o.location as unknown as { id: string; name: string; lat: number; lng: number; type: string } | null
        if (!loc) continue
        const dist = getDistanceMeters(updates.lat, updates.lng, loc.lat, loc.lng)
        if (dist <= OUTPOST_WARN_RADIUS) {
          // Cooldown: skip if recent warning for same pair
          const { data: recent } = await supabase.from('game_events').select('id').eq('game_id', player.game_id).eq('type', 'outpost_warning').eq('player_id', playerId).gt('created_at', cooldownCutoff).limit(1).maybeSingle()
          if (!recent) {
            await supabase.from('game_events').insert({
              game_id: player.game_id, type: 'outpost_warning', player_id: playerId,
              data: { outpost_id: loc.id, outpost_name: loc.name, outpost_owner_id: o.player_id, distance_meters: Math.round(dist) },
            })
          }
        }
      }
    } catch { /* graceful */ }
  }

  const allowed = ['lat', 'lng', 'last_seen', 'is_active', 'alliance_id', 'strategy']
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  )
  if (Object.keys(safeUpdates).length === 0) return Response.json({ error: 'No valid fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('players')
    .update(safeUpdates)
    .eq('id', playerId)
    .select('id, name, color, lat, lng, crowns, last_seen')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/players/[playerId]'>) {
  const supabase = await createClient()
  const { playerId } = await ctx.params

  const { data, error } = await supabase
    .from('players')
    .select('id, name, color, crowns, lat, lng, last_seen, alliance_id, is_active, strategy')
    .eq('id', playerId)
    .single()

  if (error) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(data)
}
