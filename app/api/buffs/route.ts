import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const playerId = request.nextUrl.searchParams.get('playerId')
  if (!playerId) return Response.json({ error: 'playerId required' }, { status: 400 })

  const now = new Date().toISOString()
  const { data } = await supabase
    .from('player_buffs')
    .select('*')
    .eq('player_id', playerId)
    .gt('expires_at', now)
    .order('expires_at')

  return Response.json(data ?? [])
}
