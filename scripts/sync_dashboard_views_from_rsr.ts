import { query, queryAnalytics } from '@/lib/db'
import { ALL_AVAILABLE_COLUMNS } from '@/lib/column-config'

interface SourceRow {
  id?: number | string
  name?: string
  icon?: string
  is_default?: boolean
  column_order?: unknown
  visible_tags?: unknown
  settings?: unknown
  config?: unknown
  data?: unknown
  view_settings?: unknown
  columns?: unknown
}

const tableCandidates = ['dashboard_views', 'view_settings', 'view-settings', 'viewsettings']

const parseJsonValue = (value: unknown) => {
  if (value == null) return null
  if (Array.isArray(value) || typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

const extractArray = (value: unknown): string[] | null => {
  const parsed = parseJsonValue(value)
  if (Array.isArray(parsed)) {
    return parsed.map((item) => String(item)).filter(Boolean)
  }
  return null
}

const extractSettings = (row: SourceRow) => {
  const settingsCandidates = [row.settings, row.view_settings, row.config, row.data]
  for (const candidate of settingsCandidates) {
    const parsed = parseJsonValue(candidate)
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
  }
  return null
}

const extractColumnOrder = (row: SourceRow) => {
  const direct = extractArray(row.column_order || row.columns)
  if (direct && direct.length > 0) return direct

  const settings = extractSettings(row)
  if (!settings) return null

  const settingsCandidates = [
    settings.column_order,
    settings.columns,
    settings.columnOrder,
    settings.visible_columns,
    settings.visibleColumns,
  ]

  for (const candidate of settingsCandidates) {
    const extracted = extractArray(candidate)
    if (extracted && extracted.length > 0) return extracted
  }

  return null
}

const allowedColumns = new Set(ALL_AVAILABLE_COLUMNS.map((col) => col.field))

const filterColumns = (columns: string[]) => {
  const filtered = columns.filter((column) => allowedColumns.has(column))
  const dropped = columns.filter((column) => !allowedColumns.has(column))
  return { filtered, dropped }
}

const extractVisibleTags = (row: SourceRow) => {
  const direct = extractArray(row.visible_tags)
  if (direct) return direct

  const settings = extractSettings(row)
  if (!settings) return null

  const settingsCandidates = [settings.visible_tags, settings.visibleTags, settings.tags]
  for (const candidate of settingsCandidates) {
    const extracted = extractArray(candidate)
    if (extracted && extracted.length > 0) return extracted
  }

  return null
}

const resolveSourceTable = async () => {
  for (const tableName of tableCandidates) {
    const qualified = tableName.includes('-') ? `public."${tableName}"` : `public.${tableName}`
    const result = await queryAnalytics<{ exists: string | null }>(
      'SELECT to_regclass($1) AS exists',
      [qualified]
    )
    if (result.rows[0]?.exists) {
      return { tableName, qualified }
    }
  }

  return null
}

const toBoolean = (value: unknown) => {
  if (value === true) return true
  if (value === false) return false
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  if (typeof value === 'number') return value === 1
  return false
}

const main = async () => {
  const dryRun = process.argv.includes('--dry-run')
  const sourceTable = await resolveSourceTable()

  if (!sourceTable) {
    throw new Error('No view settings table found in analytics database.')
  }

  const sourceRows = await queryAnalytics<SourceRow>(
    `SELECT * FROM ${sourceTable.qualified}`
  )

  if (sourceRows.rows.length === 0) {
    console.log('No views found to sync.')
    return
  }

  const dropSummary: Record<string, string[]> = {}
  const views = sourceRows.rows
    .map((row) => {
      const name = row.name || `View ${row.id ?? 'Unknown'}`
      const columnOrder = extractColumnOrder(row)
      if (!columnOrder || columnOrder.length === 0) return null
      const { filtered, dropped } = filterColumns(columnOrder)
      if (dropped.length > 0) {
        dropSummary[name] = dropped
      }
      return {
        name,
        icon: row.icon || '📊',
        isDefault: toBoolean(row.is_default),
        columnOrder: filtered,
        visibleTags: extractVisibleTags(row),
      }
    })
    .filter((view): view is NonNullable<typeof view> => Boolean(view && view.columnOrder.length > 0))

  if (views.length === 0) {
    console.log('No usable views found (missing column_order).')
    return
  }

  const defaultView = views.find((view) => view.isDefault) || views[0]

  if (dryRun) {
    console.log('Dry run: would sync views', {
      sourceTable: sourceTable.tableName,
      total: views.length,
      defaultView: defaultView.name,
    })
    if (Object.keys(dropSummary).length > 0) {
      console.log('Columns dropped because they are not in ShareView column config:', dropSummary)
    }
    return
  }

  await query('UPDATE dashboard_views SET is_default = false')

  for (const view of views) {
    const isDefault = view.name === defaultView.name
    await query(
      `INSERT INTO dashboard_views (name, icon, is_default, column_order, visible_tags)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name)
       DO UPDATE SET
         icon = EXCLUDED.icon,
         is_default = EXCLUDED.is_default,
         column_order = EXCLUDED.column_order,
         visible_tags = EXCLUDED.visible_tags,
         updated_at = CURRENT_TIMESTAMP`,
      [
        view.name,
        view.icon,
        isDefault,
        JSON.stringify(view.columnOrder),
        view.visibleTags ? JSON.stringify(view.visibleTags) : null,
      ]
    )
  }

  console.log(`Synced ${views.length} views from ${sourceTable.tableName}. Default: ${defaultView.name}`)
  if (Object.keys(dropSummary).length > 0) {
    console.log('Dropped columns:', dropSummary)
  }
}

main().catch((error) => {
  console.error('Failed to sync views:', error)
  process.exit(1)
})
