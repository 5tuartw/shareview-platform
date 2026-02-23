import db from './lib/db';
async function test() {
  const meta = await db.queryAnalytics("SELECT retailer_id, retailer_name FROM retailer_metadata WHERE retailer_id ILIKE '%qvc%' OR retailer_name ILIKE '%qvc%'");
  console.log('QVC in Analytics metadata:', meta.rows);
  const qvc_metrics = await db.queryAnalytics("SELECT COUNT(*) FROM retailer_metrics WHERE retailer_id IN (SELECT retailer_id FROM retailer_metadata WHERE retailer_name ILIKE '%qvc%')");
  console.log('Total QVC rows in metrics:', qvc_metrics.rows);
  process.exit(0);
}
test();
