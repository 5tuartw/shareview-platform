import db from './lib/db';
async function test() {
  const retailerId = 'qvc';
  console.log('Testing retailer_metrics for', retailerId);
  const dataResult = await db.queryAnalytics(`
    SELECT period_start_date AS period_start
    FROM retailer_metrics
    WHERE retailer_id = $1
    AND period_start_date IS NOT NULL
    AND fetch_datetime = (SELECT MAX(fetch_datetime) FROM fetch_runs WHERE fetch_type = '13_weeks')
    ORDER BY period_start_date DESC
    LIMIT 13
  `, [retailerId]);
  console.log('Result:', dataResult.rows.length);
  process.exit(0);
}
test();
