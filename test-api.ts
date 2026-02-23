import { NextResponse } from 'next/server';
import { query } from './lib/db';
async function test() {
  const params = Promise.resolve({ retailerId: 'boots' });
  const { retailerId } = await params;
  const result = await query('SELECT retailer_name FROM retailer_metadata WHERE retailer_id = $1', [retailerId]);
  console.log(result.rows);
}
test();
