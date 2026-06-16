import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDistanceMeters, isInsideGeofence, scalePolygon } from '@/lib/game-logic'
import { GamePhase, Geofence } from '@/lib/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { game_id, host_token } = await request.json()

  const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'active') return Response.json({ error: 'Game not active' }, { status: 400 })

  const config = game.config as Record<string, unknown>
  const phases = (config.phases ?? []) as GamePhase[]
  const currentPhaseIdx = (game.current_phase ?? 0) as number
  const currentPhase = phases[currentPhaseIdx] ?? null
  const geofence = config.geofence as { lat: number; lng: number; radius_meters: number } | null

  // Get all owned locations with type and region info
  const { data: ownerships } = await supabase
    .from('location_ownership')
    .select('player_id, location:locations(id, crown_value, game_id, region_id, lat, lng, type)')
    .eq('locations.game_id', game_id)

  // Build region ownership map: region_id → Set of player_ids that own ANY location there
  // Also build region total locations
  const { data: allLocations } = await supabase
    .from('locations')
    .select('id, region_id')
    .eq('game_id', game_id)

  const regionTotal: Record<string, number> = {}
  const regionOwned: Record<string, Record<string, number>> = {} // region_id → player_id → count
  for (const loc of allLocations ?? []) {
    if (!loc.region_id) continue
    regionTotal[loc.region_id] = (regionTotal[loc.region_id] ?? 0) + 1
  }
  for (const o of ownerships ?? []) {
    const loc = o.location as unknown as { id: string; crown_value: number; game_id: string; region_id: string | null; lat: number; lng: number } | null
    if (!loc || loc.game_id !== game_id || !loc.region_id) continue
    if (!regionOwned[loc.region_id]) regionOwned[loc.region_id] = {}
    regionOwned[loc.region_id][o.player_id] = (regionOwned[loc.region_id][o.player_id] ?? 0) + 1
  }

  // Players with full region control: region_id → player_id
  const regionController: Record<string, string> = {}
  for (const [rid, playerCounts] of Object.entries(regionOwned)) {
    const total = regionTotal[rid] ?? 0
    for (const [pid, count] of Object.entries(playerCounts)) {
      if (total > 0 && count >= total) regionController[rid] = pid
    }
  }

  // Active admin events: location_boost + double_crowns
  const nowForBoost = new Date().toISOString()
  const { data: activeAdminEvents } = await supabase
    .from('admin_events')
    .select('type, value')
    .eq('game_id', game_id)
    .eq('active', true)
    .gt('expires_at', nowForBoost)

  const boostedLocationIds = new Set(
    (activeAdminEvents ?? [])
      .filter((e: { type: string }) => e.type === 'location_boost')
      .map((b: { value: Record<string, unknown> }) => b.value.location_id as string)
      .filter(Boolean)
  )
  const globalDoubleCrowns = (activeAdminEvents ?? []).some((e: { type: string }) => e.type === 'double_crowns')

  // Count checkpoints per player for route bonus
  type OwnedLoc = { id: string; crown_value: number; game_id: string; region_id: string | null; lat: number; lng: number; type: string }
  const checkpointCountByPlayer: Record<string, number> = {}
  for (const o of ownerships ?? []) {
    const loc = o.location as unknown as OwnedLoc | null
    if (!loc || loc.game_id !== game_id) continue
    if (loc.type === 'checkpoint') {
      checkpointCountByPlayer[o.player_id] = (checkpointCountByPlayer[o.player_id] ?? 0) + 1
    }
  }

  // Sum base payouts per player (with location boost + checkpoint route bonus)
  const basePayout: Record<string, number> = {}
  for (const o of ownerships ?? []) {
    const loc = o.location as unknown as OwnedLoc | null
    if (!loc || loc.game_id !== game_id) continue
    const boostFactor = boostedLocationIds.has(loc.id) ? 3 : 1
    // Checkpoint route bonus: 2 checkpoints = 1.5×, 3+ = 2× per checkpoint
    let checkpointMultiplier = 1
    if (loc.type === 'checkpoint') {
      const n = checkpointCountByPlayer[o.player_id] ?? 1
      if (n >= 3) checkpointMultiplier = 2
      else if (n >= 2) checkpointMultiplier = 1.5
    }
    // Homebase (base type) gives 2× income
    const baseMultiplier = loc.type === 'base' ? 2 : 1
    basePayout[o.player_id] = (basePayout[o.player_id] ?? 0) + loc.crown_value * boostFactor * checkpointMultiplier * baseMultiplier
  }

  // Region bonus: +25% on all income if player controls a full region
  const regionControllers = new Set(Object.values(regionController))

  // Active double_income buffs
  const now = new Date().toISOString()
  const { data: buffs } = await supabase
    .from('player_buffs')
    .select('player_id, type')
    .eq('game_id', game_id)
    .gt('expires_at', now)
  const doubleIncomePlayers = new Set((buffs ?? []).filter((b: { type: string }) => b.type === 'double_income').map((b: { player_id: string }) => b.player_id))

  // All active players for zone penalty
  const { data: activePlayers } = await supabase
    .from('players')
    .select('id, crowns, lat, lng')
    .eq('game_id', game_id)
    .eq('is_active', true)

  const payouts: Record<string, number> = {}
  const penalties: Record<string, number> = {}

  for (const player of activePlayers ?? []) {
    const base = basePayout[player.id] ?? 0
    const buffMultiplier = doubleIncomePlayers.has(player.id) ? 2 : 1
    const eventMultiplier = globalDoubleCrowns ? 2 : 1
    const regionBonus = regionControllers.has(player.id) ? 1.25 : 1
    // Catch-up mechanic: players with no locations get passive income
    const catchUpBonus = base === 0 ? 2 : 0
    const earned = Math.round(base * buffMultiplier * eventMultiplier * regionBonus) + catchUpBonus
    payouts[player.id] = earned

    // Zone penalty
    let penalty = 0
    if (geofence && currentPhase && currentPhase.crown_penalty_per_tick > 0 && player.lat && player.lng) {
      if (!isInsideGeofence(player.lat, player.lng, geofence as import('@/lib/types').Geofence)) {
        penalty = currentPhase.crown_penalty_per_tick
      }
    }
    penalties[player.id] = penalty

    const newCrowns = Math.max(0, player.crowns + earned - penalty)
    await supabase.from('players').update({ crowns: newCrowns }).eq('id', player.id)

    // Update stats (upsert)
    if (earned > 0 || penalty > 0) {
      const { data: existingStat } = await supabase.from('player_stats').select('crowns_earned, crowns_lost').eq('player_id', player.id).eq('game_id', game_id).maybeSingle()
      await supabase.from('player_stats').upsert({
        player_id: player.id, game_id,
        crowns_earned: (existingStat?.crowns_earned ?? 0) + earned,
        crowns_lost: (existingStat?.crowns_lost ?? 0) + penalty,
      }, { onConflict: 'player_id,game_id' })
    }
  }

  // Expire old buffs
  await supabase.from('player_buffs').delete().eq('game_id', game_id).lt('expires_at', now)

  // Deactivate double_crowns admin event after applying it this tick
  if (globalDoubleCrowns) {
    await supabase.from('admin_events').update({ active: false }).eq('game_id', game_id).eq('type', 'double_crowns').eq('active', true)
  }

  // Build current crown snapshot after this tick
  const scores: Record<string, number> = {}
  for (const player of activePlayers ?? []) {
    scores[player.id] = Math.max(0, player.crowns + (payouts[player.id] ?? 0) - (penalties[player.id] ?? 0))
  }

  await supabase.from('game_events').insert({
    game_id,
    type: 'crown_tick',
    data: {
      payouts,
      penalties,
      scores,
      phase: currentPhase?.name ?? null,
      region_controllers: regionController,
      total_players: (activePlayers ?? []).length,
      double_crowns: globalDoubleCrowns,
      checkpoint_routes: checkpointCountByPlayer,
    },
  })

  // Auto phase advancement
  let autoAdvanced = false
  const phaseStartedAt = config.phase_started_at as string | null
  if (currentPhase && phaseStartedAt && currentPhaseIdx < phases.length - 1) {
    const elapsed = (Date.now() - new Date(phaseStartedAt).getTime()) / 60000
    if (elapsed >= currentPhase.duration_minutes) {
      const nextPhaseIdx = currentPhaseIdx + 1
      const nextPhase = phases[nextPhaseIdx]
      const rawGeofence = config.geofence as Geofence | null
      const baseRadius = config.geofence_base_radius as number | null

      let newGeofence: Geofence | null = rawGeofence
      if (rawGeofence) {
        if (rawGeofence.type === 'polygon') {
          newGeofence = { type: 'polygon', points: scalePolygon(rawGeofence.points, nextPhase.zone_factor) }
        } else {
          const base = baseRadius ?? rawGeofence.radius_meters
          newGeofence = { lat: rawGeofence.lat, lng: rawGeofence.lng, radius_meters: Math.round(base * nextPhase.zone_factor) }
        }
      }

      // Neutralize outside-zone locations
      if (newGeofence) {
        const { data: locs } = await supabase.from('locations').select('id, lat, lng').eq('game_id', game_id)
        const outsideIds = (locs ?? []).filter(l => !isInsideGeofence(l.lat, l.lng, newGeofence!)).map(l => l.id)
        if (outsideIds.length > 0) await supabase.from('location_ownership').delete().in('location_id', outsideIds)
      }

      const newBaseRadius = rawGeofence?.type !== 'polygon' ? (baseRadius ?? (rawGeofence as { radius_meters?: number })?.radius_meters ?? null) : null

      await supabase.from('games').update({
        current_phase: nextPhaseIdx,
        config: { ...config, geofence: newGeofence, geofence_base_radius: newBaseRadius, phase_started_at: new Date().toISOString() },
      }).eq('id', game_id)

      await supabase.from('game_events').insert({
        game_id, type: 'phase_change', player_id: null,
        data: { phase_index: nextPhaseIdx, phase_name: nextPhase.name, zone_factor: nextPhase.zone_factor, crown_penalty: nextPhase.crown_penalty_per_tick, auto: true },
      })
      autoAdvanced = true
    }
  }

  return Response.json({ paid: Object.keys(payouts).length, payouts, penalties, region_controllers: regionController, double_crowns: globalDoubleCrowns, auto_phase_advanced: autoAdvanced })
}
