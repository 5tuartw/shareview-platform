import { query } from '@/lib/db'

export type MarketComparisonSettings = {
  allow_ai_assigned_profile_values: boolean
}

export const DEFAULT_MARKET_COMPARISON_SETTINGS: MarketComparisonSettings = {
  allow_ai_assigned_profile_values: true,
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

export const getMarketComparisonSettings = async (): Promise<MarketComparisonSettings> => {
  const hasTable = await hasSettingsTable()
  if (!hasTable) return DEFAULT_MARKET_COMPARISON_SETTINGS

  const result = await query<{
    allow_ai_assigned_profile_values: boolean
  }>(`
    SELECT allow_ai_assigned_profile_values
    FROM market_comparison_settings
    WHERE id = 1
    LIMIT 1
  `)

  if (result.rowCount === 0) {
    return DEFAULT_MARKET_COMPARISON_SETTINGS
  }

  return {
    allow_ai_assigned_profile_values: result.rows[0].allow_ai_assigned_profile_values === true,
  }
}
