#!/usr/bin/env tsx
/**
 * Debug database connection configuration
 * Usage: npx tsx scripts/debug-db-config.ts
 */

console.log('Database Configuration:');
console.log('======================');
console.log('PGHOST:', process.env.PGHOST);
console.log('PGPORT:', process.env.PGPORT);
console.log('PGUSER:', process.env.PGUSER);
console.log('PGPASSWORD:', process.env.PGPASSWORD ? `${process.env.PGPASSWORD.substring(0, 5)}... (${process.env.PGPASSWORD.length} chars, type: ${typeof process.env.PGPASSWORD})` : 'NOT SET');
console.log('PGDATABASE:', process.env.PGDATABASE);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 50)}...` : 'NOT SET');
console.log('\nPassword checks:');
console.log('- Is string?', typeof process.env.PGPASSWORD === 'string');
console.log('- Length:', process.env.PGPASSWORD?.length);
console.log('- Contains special chars?', /[!@#$%^&*()]/.test(process.env.PGPASSWORD || ''));
