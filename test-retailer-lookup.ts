import 'dotenv/config';
import db from './lib/db';

async function test() {
  console.log('\n=== Testing Retailer Lookup ===\n');
  
  // Check ShareView retailer_master
  console.log('1. Checking ShareView retailer_master for "boots":');
  const svMaster = await db.query("SELECT * FROM retailer_master WHERE retailer_id = $1 OR LOWER(retailer_id) = $1", ['boots']);
  console.log('   Result:', svMaster.rows.length > 0 ? svMaster.rows : 'NOT FOUND');
  
  // Check all retailers in ShareView
  console.log('\n2. All retailers in ShareView retailer_master:');
  const allSvRetailers = await db.query("SELECT retailer_id, retailer_name FROM retailer_master ORDER BY retailer_id LIMIT 10");
  console.log('   Count:', allSvRetailers.rows.length);
  console.log('   Sample:', allSvRetailers.rows.slice(0, 5));
  
  // Check RSR retailer_metadata for "boots"
  console.log('\n3. Checking RSR retailer_metadata for "Boots":');
  const rsrMeta = await db.queryAnalytics("SELECT * FROM retailer_metadata WHERE LOWER(retailer_name) LIKE '%boots%' OR retailer_id = '2041'");
  console.log('   Result:', rsrMeta.rows.length > 0 ? rsrMeta.rows : 'NOT FOUND');
  
  // Test the mapping function
  console.log('\n4. Testing getAnalyticsNetworkId("boots"):');
  try {
    const networkId = await db.getAnalyticsNetworkId('boots');
    console.log('   Result:', networkId || 'NULL');
  } catch (error) {
    console.error('   Error:', error instanceof Error ? error.message : error);
  }
  
  process.exit(0);
}

test().catch(console.error);
