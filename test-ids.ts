import db from './lib/db';
async function test() {
  const ids = await db.queryAnalytics("SELECT DISTINCT retailer_id FROM retailer_metrics WHERE retailer_id ILIKE '%qvc%' LIMIT 10");
  console.log('Similar IDs:', ids.rows);
  const any_ids = await db.queryAnalytics("SELECT DISTINCT retailer_id FROM retailer_metrics LIMIT 10");
  console.log('Some IDs:', any_ids.rows);
  process.exit(0);
}
test();
