import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'
import { query } from '@/lib/db'
import {
  DEFAULT_MARKET_COMPARISON_SETTINGS,
  getMarketComparisonSettings,
} from '@/lib/market-comparison-settings'

type SettingsBody = {
  allow_ai_assigned_profile_values?: boolean
}

const hasSettingsTable = async (): Promise<boolean> => {
  const result = await query<{ has_table: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'market_comparison_settings'
    ) AS has_table
  `)

  return result.rows[0]?.has_table === true
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const settings = await getMarketComparisonSettings()
    return NextResponse.json({
      settings,
      defaults: DEFAULT_MARKET_COMPARISON_SETTINGS,
    })
  } catch (error) {
    console.error('Market comparison settings GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!await hasActiveRole(session, 'CSS_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden: Super Admin role required' }, { status: 403 })
    }

    const tableReady = await hasSettingsTable()
    if (!tableReady) {
      return NextResponse.json(
        { error: 'market_comparison_settings table is missing. Run migration 20260317020000 first.' },
        { status: 409 }
      )
    }

    let body: SettingsBody
    try {
      body = (await request.json()) as SettingsBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const allowAiAssigned = body.allow_ai_assigned_profile_values === true

    await query(
      `INSERT INTO market_comparison_settings (id, allow_ai_assigned_profile_values, updated_by, created_at, updated_at)
       VALUES (1, $1, $2, NOW(), NOW())
       ON CONFLICT (id)
       DO UPDATE SET
         allow_ai_assigned_profile_values = EXCLUDED.allow_ai_assigned_profile_values,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [allowAiAssigned, Number(session.user.id)]
    )

    const settings = await getMarketComparisonSettings()
    return NextResponse.json({
      settings,
      defaults: DEFAULT_MARKET_COMPARISON_SETTINGS,
    })
  } catch (error) {
    console.error('Market comparison settings PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
