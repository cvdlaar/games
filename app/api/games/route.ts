import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateGameCode, generateToken } from '@/lib/game-logic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  const { name, config } = body

  if (!name?.trim()) {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }

  let code = generateGameCode()
  let attempts = 0
  while (attempts < 10) {
    const { data: existing } = await supabase.from('games').select('id').eq('code', code).single()
    if (!existing) break
    code = generateGameCode()
    attempts++
  }

  const { data, error } = await supabase
    .from('games')
    .insert({ name: name.trim(), code, host_token: generateToken(), config: config ?? {} })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const code = request.nextUrl.searchParams.get('code')

  if (code) {
    const { data, error } = await supabase
      .from('games')
      .select('id, code, name, status, config, starts_at, ends_at, created_at')
      .eq('code', code.toUpperCase())
      .single()
    if (error) return Response.json({ error: 'Game not found' }, { status: 404 })
    return Response.json(data)
  }

  const { data, error } = await supabase
    .from('games')
    .select('id, code, name, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
