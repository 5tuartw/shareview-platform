import { query } from './lib/db';
async function run() {
  const retailerId = 'boots';
  console.log(`retailerId: "${retailerId}"`);
  const result = await query('SELECT retailer_name FROM retailer_metadata WHERE retailer_id = $1', [retailerId]);
  console.log(result.rows);
  process.exit(0);
}
run();
