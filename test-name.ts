import db from './lib/db';
async function run() {
  const result = await db.query('SELECT retailer_name FROM retailer_metadata WHERE retailer_id = $1', ['boots']);
  console.log(result.rows);
  process.exit(0);
}
run();
