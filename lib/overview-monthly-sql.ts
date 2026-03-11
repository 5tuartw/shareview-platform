type MonthlyQueryMode = 'withMonthStart' | 'withMonthYear'

const rankingOrder = `
  COALESCE(fetch_run_id, 0) DESC,
  COALESCE(created_at, updated_at, '1970-01-01'::timestamp) DESC,
  id DESC
`

export const buildOverviewMonthlyQuery = (mode: MonthlyQueryMode): string => {
  if (mode === 'withMonthStart') {
    return `WITH ranked AS (
      SELECT
        month_start AS period_start,
        gmv,
        COALESCE(conversions, google_conversions_transaction) AS conversions,
        profit,
        roi,
        impressions,
        COALESCE(clicks, google_clicks) AS clicks,
        ctr,
        COALESCE(cvr, conversion_rate) AS cvr,
        validation_rate,
        commission_validated AS commission,
        ROW_NUMBER() OVER (
          PARTITION BY month_start
          ORDER BY ${rankingOrder}
        ) AS row_rank
      FROM monthly_archive
      WHERE retailer_id = $1
        AND ($2::date IS NULL OR month_start <= $2::date)
    ),
    monthly_dedup AS (
      SELECT
        period_start,
        gmv,
        conversions,
        profit,
        roi,
        impressions,
        clicks,
        ctr,
        cvr,
        validation_rate,
        commission
      FROM ranked
      WHERE row_rank = 1
    ),
    latest_13 AS (
      SELECT *
      FROM monthly_dedup
      ORDER BY period_start DESC
      LIMIT 13
    )
    SELECT *
    FROM latest_13
    ORDER BY period_start ASC`
  }

  return `WITH ranked AS (
    SELECT
      TO_DATE(month_year, 'YYYY-MM') AS period_start,
      gmv,
      google_conversions_transaction AS conversions,
      profit,
      roi,
      impressions,
      google_clicks AS clicks,
      ctr,
      conversion_rate AS cvr,
      validation_rate,
      commission_validated AS commission,
      ROW_NUMBER() OVER (
        PARTITION BY TO_DATE(month_year, 'YYYY-MM')
        ORDER BY ${rankingOrder}
      ) AS row_rank
    FROM monthly_archive
    WHERE retailer_id = $1
      AND ($2::date IS NULL OR TO_DATE(month_year, 'YYYY-MM') <= $2::date)
  ),
  monthly_dedup AS (
    SELECT
      period_start,
      gmv,
      conversions,
      profit,
      roi,
      impressions,
      clicks,
      ctr,
      cvr,
      validation_rate,
      commission
    FROM ranked
    WHERE row_rank = 1
  ),
  latest_13 AS (
    SELECT *
    FROM monthly_dedup
    ORDER BY period_start DESC
    LIMIT 13
  )
  SELECT *
  FROM latest_13
  ORDER BY period_start ASC`
}

export const buildMarketComparisonMonthlyQuery = (mode: MonthlyQueryMode): string => {
  if (mode === 'withMonthStart') {
    return `WITH ranked AS (
      SELECT
        retailer_id,
        month_start::text AS period_start,
        gmv,
        profit,
        impressions,
        COALESCE(clicks, google_clicks) AS clicks,
        COALESCE(conversions, google_conversions_transaction) AS conversions,
        ctr,
        COALESCE(cvr, conversion_rate) AS cvr,
        roi,
        ROW_NUMBER() OVER (
          PARTITION BY retailer_id, month_start
          ORDER BY ${rankingOrder}
        ) AS row_rank
      FROM monthly_archive
      WHERE retailer_id = ANY($1)
        AND month_start = ANY($2::date[])
    )
    SELECT *
    FROM ranked
    WHERE row_rank = 1`
  }

  return `WITH ranked AS (
    SELECT
      retailer_id,
      TO_DATE(month_year, 'YYYY-MM')::text AS period_start,
      gmv,
      profit,
      impressions,
      google_clicks AS clicks,
      google_conversions_transaction AS conversions,
      ctr,
      conversion_rate AS cvr,
      roi,
      ROW_NUMBER() OVER (
        PARTITION BY retailer_id, TO_DATE(month_year, 'YYYY-MM')
        ORDER BY ${rankingOrder}
      ) AS row_rank
    FROM monthly_archive
    WHERE retailer_id = ANY($1)
      AND TO_DATE(month_year, 'YYYY-MM') = ANY($2::date[])
  )
  SELECT *
  FROM ranked
  WHERE row_rank = 1`
}
