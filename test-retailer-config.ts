import 'dotenv/config';
import db from './lib/db';

async function test() {
  const retailerId = process.argv[2] || 'boots';
  
  console.log(`\n=== Checking retailer config for "${retailerId}" ===\n`);
  
  // Check if retailer_config exists
  const config = await db.query(
    "SELECT * FROM retailer_config WHERE retailer_id = $1",
    [retailerId]
  );
  
  if (config.rows.length === 0) {
    console.log('❌ No retailer_config found');
    console.log('\nCreating default config...');
    
    // Create default config
    await db.query(
      `INSERT INTO retailer_config (retailer_id) VALUES ($1)`,
      [retailerId]
    );
    
    const newConfig = await db.query(
      "SELECT * FROM retailer_config WHERE retailer_id = $1",
      [retailerId]
    );
    console.log('✅ Created default config:', newConfig.rows[0]);
  } else {
    console.log('✅ retailer_config found:', config.rows[0]);
  }
  
  process.exit(0);
}

test().catch(console.error);
