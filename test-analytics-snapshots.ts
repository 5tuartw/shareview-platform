import db from './lib/db';
async function test() {
  const t1 = await db.queryAnalytics("SELECT retailer_id FROM auction_insights LIMIT 1");
  console.log('auction_insights retailer_id:', t1.rows);
  const t2 = await db.queryAnalytics("SELECT retailer_id FROM keywords_snapshots LIMIT 1");
  console.log('keywords_snapshots retailer_id:', t2.rows);
  const t3 = await db.queryAnalytics("SELECT retailer_id FROM mv_keywords_actionable LIMIT 1");
  console.log('mv_keywords_actionable retailer_id:', t3.rows);
  process.exit(0);
}
test();
