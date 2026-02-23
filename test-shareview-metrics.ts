import db from './lib/db';
async function test() {
  try {
    const metrics = await db.query("SELECT COUNT(*) FROM retailer_metrics WHERE retailer_id = 'qvc'");
    console.log('QVC in shareview retailer_metrics:', metrics.rows);
  } catch(e) { console.log('error query shareview retailer_metrics', e) }
  process.exit(0);
}
test();
