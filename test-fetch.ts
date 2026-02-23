import db from './lib/db';
async function test() {
  const fetch_runs = await db.queryAnalytics("SELECT * FROM fetch_runs WHERE fetch_type = '13_weeks' ORDER BY fetch_datetime DESC LIMIT 5");
  console.log('fetch_runs:', fetch_runs.rows);
  const qvc_metrics = await db.queryAnalytics("SELECT COUNT(*) FROM retailer_metrics WHERE retailer_id = 'qvc'");
  console.log('Total QVC rows:', qvc_metrics.rows);
  
  const qvc_fetch = await db.queryAnalytics("SELECT DISTINCT fetch_datetime FROM retailer_metrics WHERE retailer_id = 'qvc' ORDER BY fetch_datetime DESC LIMIT 5");
  console.log('QVC fetch_datetimes:', qvc_fetch.rows);
  process.exit(0);
}
test();
