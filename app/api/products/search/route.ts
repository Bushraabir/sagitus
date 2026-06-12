// app/api/products/search/route.ts

import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  const debug = searchParams.get('debug') === '1'

  if (q.length < 2) return NextResponse.json([])

  const supabase = await createServerClient()

  // ── DEBUG MODE: visit /api/products/search?q=hello+world&debug=1 ──
  if (debug) {
    const results: Record<string, unknown> = {}

    // Step 1: can we read the table at all?
    const { data: allProducts, error: allError } = await supabase
      .from('products')
      .select('id, name, in_stock')
      .limit(10)
    results.step1_all_products = { data: allProducts, error: allError?.message ?? null }

    // Step 2: does ILIKE work without any other filter?
    const { data: ilikeData, error: ilikeError } = await supabase
      .from('products')
      .select('id, name, in_stock')
      .ilike('name', `%${q}%`)
    results.step2_ilike_no_filter = { data: ilikeData, error: ilikeError?.message ?? null }

    // Step 3: does adding in_stock = true kill the results?
    const { data: stockData, error: stockError } = await supabase
      .from('products')
      .select('id, name, in_stock')
      .ilike('name', `%${q}%`)
      .eq('in_stock', true)
    results.step3_ilike_with_stock = { data: stockData, error: stockError?.message ?? null }

    // Step 4: does the RPC function exist?
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('search_products', { query: q })
    results.step4_rpc = {
      data: rpcData,
      error: rpcError?.message ?? null,
      hint: rpcError?.hint ?? null,
      code: rpcError?.code ?? null,
    }

    return NextResponse.json(results, { status: 200 })
  }

  // ── NORMAL SEARCH ──
  try {
    const { data, error } = await supabase.rpc('search_products', { query: q })

    if (error) {
      console.error('[search] RPC failed:', error.message, error.hint, error.code)
      return NextResponse.json(await fallbackSearch(supabase, q))
    }

    return NextResponse.json(
      (data ?? []).map((p: any) => ({
        ...p,
        images: p.images ?? [],
        matchType: classifyMatch(p, q),
      }))
    )
  } catch (err) {
    console.error('[search] exception:', err)
    return NextResponse.json([])
  }
}

async function fallbackSearch(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  query: string
) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, description, price, image_url, images, discount_percent, in_stock, stock_quantity, created_at, updated_at')
    .is('is_deleted', false)
    .ilike('name', `%${query}%`)
    .eq('in_stock', true)
    .order('created_at', { ascending: false })
    .limit(8)

  if (error) {
    console.error('[search] fallback failed:', error.message)
    return []
  }

  return (data ?? []).map((p: any) => ({
    ...p,
    images: p.images ?? [],
    matchType: classifyMatch(p, query),
  }))
}

function classifyMatch(product: { name: string }, query: string) {
  const lq = query.toLowerCase()
  const ln = product.name.toLowerCase()
  if (ln === lq) return 'exact'
  if (ln.includes(lq)) return 'partial'
  return 'fuzzy'
}