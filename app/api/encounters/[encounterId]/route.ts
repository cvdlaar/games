import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveEncounter, calculateEncounterReward } from '@/lib/game-logic'
import { EncounterChoice } from '@/lib/types'

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/encounters/[encounterId]'>) {
  const supabase = await createClient()
  const { encounterId } = await ctx.params
  const { player_id, token, choice } = await request.json()

  const { data: player } = await supabase.from('players').select('*').eq('id', player_id).single()
  if (!player || player.token !== token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data: encounter } = await supabase.from('encounters').select('*').eq('id', encounterId).single()
  if (!encounter) return Response.json({ error: 'Not found' }, { status: 404 })
  if (encounter.status !== 'pending') return Response.json({ error: 'Already resolved' }, { status: 400 })
  if (new Date(encounter.expires_at) < new Date()) {
    await supabase.from('encounters').update({ status: 'expired' }).eq('id', encounterId)
    return Response.json({ error: 'Encounter expired' }, { status: 400 })
  }

  const isInitiator = encounter.initiator_id === player_id
  const isTarget = encounter.target_id === player_id
  if (!isInitiator && !isTarget) {
    return Response.json({ error: 'Not your encounter' }, { status: 403 })
  }

  const updateField = isInitiator ? 'initiator_choice' : 'target_choice'
  await supabase.from('encounters').update({ [updateField]: choice }).eq('id', encounterId)

  const updated = { ...encounter, [updateField]: choice }
  if (!updated.initiator_choice || !updated.target_choice) {
    return Response.json({ status: 'waiting', message: 'Waiting for other player...' })
  }

  const { result1, result2 } = resolveEncounter(
    updated.initiator_choice as EncounterChoice,
    updated.target_choice as EncounterChoice,
  )

  const winnerId = result1 === 'win' ? encounter.initiator_id : result1 === 'lose' ? encounter.target_id : null

  await supabase.from('encounters').update({ status: 'resolved', winner_id: winnerId }).eq('id', encounterId)

  const [{ data: init }, { data: targ }] = await Promise.all([
    supabase.from('players').select('crowns').eq('id', encounter.initiator_id).single(),
    supabase.from('players').select('crowns').eq('id', encounter.target_id).single(),
  ])

  const initReward = calculateEncounterReward(result1, updated.initiator_choice as EncounterChoice)
  const targReward = calculateEncounterReward(result2, updated.target_choice as EncounterChoice)

  await Promise.all([
    supabase.from('players').update({ crowns: Math.max(0, (init?.crowns ?? 0) + initReward) }).eq('id', encounter.initiator_id),
    supabase.from('players').update({ crowns: Math.max(0, (targ?.crowns ?? 0) + targReward) }).eq('id', encounter.target_id),
  ])

  await supabase.from('game_events').insert({
    game_id: encounter.game_id,
    type: 'encounter_resolved',
    player_id: winnerId,
    data: {
      encounter_id: encounterId,
      initiator_id: encounter.initiator_id,
      target_id: encounter.target_id,
      initiator_choice: updated.initiator_choice,
      target_choice: updated.target_choice,
      winner_id: winnerId,
    },
  })

  return Response.json({
    status: 'resolved',
    result: isInitiator ? result1 : result2,
    your_choice: choice,
    opponent_choice: isInitiator ? updated.target_choice : updated.initiator_choice,
    crown_change: isInitiator ? initReward : targReward,
    winner_id: winnerId,
  })
}
