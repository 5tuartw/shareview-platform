/**
 * Quick connection test for port 18097
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';

config({ path: resolve(process.cwd(), '.env.local') });

const pool = new Pool({
  host: '127.0.0.1',
  port: 18097,
  user: 'postgres',
  password: process.env.SOURCE_DB_PASS,
  database: 'acc_mgmt',
  connectionTimeoutMillis: 5000,
});

async function test() {
  try {
    console.log('Testing connection to 127.0.0.1:18097...');
    const result = await pool.query('SELECT NOW() as current_time, version()');
    console.log('✅ Connection successful!');
    console.log('Time:', result.rows[0].current_time);
    console.log('Version:', result.rows[0].version);
    
    // Try to list tables
    console.log('\nListing tables...');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
      LIMIT 20
    `);
    console.log(`Found ${tables.rows.length} tables:`);
    tables.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

test();
