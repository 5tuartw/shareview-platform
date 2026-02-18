// file: shareview-platform/app/api/insights/prompt-templates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageInsights } from '@/lib/permissions'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !canManageInsights(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const pageType = searchParams.get('pageType')
  const insightType = searchParams.get('insightType')

  const params: string[] = []
  const conditions: string[] = ['is_active = true']

  if (pageType) {
    params.push(pageType)
    conditions.push(`page_type = $${params.length}`)
  }

  if (insightType) {
    params.push(insightType)
    conditions.push(`insight_type = $${params.length}`)
  }

  const sql = `
    SELECT id, page_type, tab_name, insight_type, prompt_text, style_directive, 
           updated_by, updated_at, created_at
    FROM prompt_templates
    WHERE ${conditions.join(' AND ')}
    ORDER BY page_type, insight_type
  `

  const result = await query(sql, params)
  return NextResponse.json(result.rows)
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !canManageInsights(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { page_type, tab_name, insight_type, prompt_text, style_directive } = body

  if (!page_type || !tab_name || !insight_type || !prompt_text) {
    return NextResponse.json(
      { error: 'Missing required fields: page_type, tab_name, insight_type, prompt_text' },
      { status: 400 }
    )
  }

  const sql = `
    INSERT INTO prompt_templates (page_type, tab_name, insight_type, prompt_text, style_directive, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (page_type, tab_name, insight_type)
    DO UPDATE SET
      prompt_text = EXCLUDED.prompt_text,
      style_directive = EXCLUDED.style_directive,
      updated_at = NOW()
    RETURNING *
  `

  const result = await query(sql, [page_type, tab_name, insight_type, prompt_text, style_directive || 'standard'])
  return NextResponse.json(result.rows[0])
}
