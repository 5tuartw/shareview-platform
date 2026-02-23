import db from './lib/db';
async function run() {
  const result = await db.query('SELECT * FROM retailer_config LIMIT 1');
  console.log(result.rows);
  process.exit(0);
}
run();
