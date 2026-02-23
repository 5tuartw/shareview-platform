import db from './lib/db';
async function run() {
  const meta = await db.query('SELECT retailer_id, retailer_name FROM retailer_metadata');
  console.log('metadata:', meta.rows);

  const metaIds = meta.rows.map(r => r.retailer_id);
  const metrics = await db.queryAnalytics('SELECT DISTINCT retailer_id, retailer_name FROM retailer_metrics WHERE retailer_id = ANY($1)', [metaIds]);
  console.log('metrics matching meta.retailer_id:', metrics.rows);
  
  const metricsByName = await db.queryAnalytics('SELECT DISTINCT retailer_id, retailer_name FROM retailer_metrics WHERE retailer_name = ANY($1)', [meta.rows.map(r => r.retailer_name)]);
  console.log('metrics matching meta.retailer_name:', metricsByName.rows);
  
  process.exit(0);
}
run();
