import db from './lib/db';
async function test() {
  try {
    const cols = await db.queryAnalytics(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'retailer_metadata'
    `);
    console.log('Columns in analytics retailer_metadata:', cols.rows);
  } catch(e) { console.log('error', e) }
  process.exit(0);
}
test();
