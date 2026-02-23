import db from './lib/db';
async function test() {
  const cols = await db.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'retailer_metadata'
  `);
  console.log('Columns in shareview retailer_metadata:', cols.rows);
  const qvc = await db.query("SELECT * FROM retailer_metadata WHERE retailer_id = 'qvc'");
  console.log('QVC in shareview:', qvc.rows);
  process.exit(0);
}
test();
