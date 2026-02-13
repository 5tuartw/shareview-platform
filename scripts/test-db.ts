#!/usr/bin/env tsx
/**
 * Test database connection
 * Usage: npx tsx scripts/test-db.ts
 */

import { testConnection, closePool } from '../lib/db';

async function main() {
  console.log('Testing database connection...\n');
  
  try {
    await testConnection();
    console.log('\n✅ Database connection test successful!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database connection test failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
