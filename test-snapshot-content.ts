import db from './lib/db';
async function test() {
  const t1 = await db.query("SELECT DISTINCT retailer_id FROM keywords_snapshots LIMIT 5");
  console.log('shareview keywords_snapshots ids:', t1.rows);
  const t2 = await db.query("SELECT DISTINCT retailer_id FROM category_performance_snapshots LIMIT 5");
  console.log('shareview category_performance_snapshots ids:', t2.rows);
  process.exit(0);
}
test();
