import db from './lib/db';
async function run() {
  try {
     const result1 = await db.query('SELECT retailer_name FROM retailer_metadata WHERE retailer_id = $1', ['boots']);
     console.log('Result 1 done');
     const result2 = await db.query('SELECT * FROM retailer_config WHERE retailer_id = $1', ['boots']);
     console.log('Result 2 done', result2.rows);
  } catch (e) {
     console.log('Error', e);
  }
  process.exit(0);
}
run();
