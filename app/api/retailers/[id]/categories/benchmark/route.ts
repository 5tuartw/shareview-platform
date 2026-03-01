// Category Benchmark Info API
// GET /api/retailers/[id]/categories/benchmark
// Returns the most recent category snapshot period's benchmark metadata
// plus the trimmed (non-benchmark) category nodes.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { canAccessRetailer } from '@/lib/permissions';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: retailerId } = await params;

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canAccessRetailer(session, retailerId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Most recent full-month benchmark period for this retailer
    const periodResult = await query(`
      SELECT
        retailer_id,
        range_start::text AS period_start,
        range_end::text   AS period_end,
        to_char(range_start, 'YYYY-MM') AS period,
        benchmark_strategy,
        total_scorable_nodes,
        benchmark_node_count,
        benchmark_impression_pct,
        benchmark_avg_ctr,
        benchmark_avg_cvr,
        trimming_enabled,
        created_at
      FROM category_snapshot_periods
      WHERE retailer_id = $1
        AND range_type = 'month'
      ORDER BY range_start DESC
      LIMIT 1
    `, [retailerId]);

    if (periodResult.rows.length === 0) {
      return NextResponse.json({ period: null, trimmed_categories: [], total_trimmed: 0 });
    }

    const period = periodResult.rows[0];

    // Trimmed nodes for that period, ordered by node impressions descending
    const trimmedResult = await query(`
      SELECT
        full_path,
        depth,
        node_impressions,
        node_clicks,
        node_conversions,
        node_ctr,
        node_cvr,
        health_status_node,
        health_status_branch
      FROM category_performance_snapshots
      WHERE retailer_id = $1
        AND range_type  = 'month'
        AND range_start = $2
        AND in_benchmark = FALSE
      ORDER BY node_impressions DESC NULLS LAST
    `, [retailerId, period.period_start]);

    return NextResponse.json({
      period: period.period,
      benchmark_strategy:       period.benchmark_strategy,
      total_scorable_nodes:     period.total_scorable_nodes,
      benchmark_node_count:     period.benchmark_node_count,
      benchmark_impression_pct: period.benchmark_impression_pct ? Number(period.benchmark_impression_pct) : null,
      benchmark_avg_ctr:        period.benchmark_avg_ctr ? Number(period.benchmark_avg_ctr) : null,
      benchmark_avg_cvr:        period.benchmark_avg_cvr ? Number(period.benchmark_avg_cvr) : null,
      trimming_enabled:         period.trimming_enabled,
      total_trimmed:            trimmedResult.rows.length,
      trimmed_categories:       trimmedResult.rows.map(r => ({
        full_path:          r.full_path,
        depth:              r.depth,
        node_impressions:   r.node_impressions ? Number(r.node_impressions) : 0,
        node_ctr:           r.node_ctr ? Number(r.node_ctr) : null,
        node_cvr:           r.node_cvr ? Number(r.node_cvr) : null,
        health_status_node: r.health_status_node,
      })),
    });
  } catch (error) {
    console.error('Error fetching category benchmark info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch benchmark info', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
