import db from './lib/db';
async function run() {
  const res1 = await db.query('SELECT retailer_id, retailer_name FROM retailer_metadata');
  console.log('metadata:', res1.rows);
  const res2 = await db.queryAnalytics('SELECT DISTINCT retailer_id, retailer_name FROM retailer_metrics');
  console.log('metrics:', res2.rows);
  process.exit(0);
}
run();
