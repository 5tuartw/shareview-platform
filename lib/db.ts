import { Pool, QueryResult, QueryResultRow } from 'pg';

// Database connection pool configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // How long a connection can be idle before being closed (30 seconds)
  connectionTimeoutMillis: 2000, // How long to wait for a connection (2 seconds)
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Execute a SQL query with optional parameters
 * @param text SQL query string (use $1, $2, etc. for parameters)
 * @param params Query parameters
 * @returns Query result
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Execute multiple queries in a transaction
 * @param callback Function that receives a client and executes queries
 * @returns Result of the callback function
 */
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connection
 * Used for health checks and verification
 */
export async function testConnection(): Promise<void> {
  try {
    const result = await query('SELECT NOW() as current_time, version() as db_version');
    console.log('Database connection successful:', {
      timestamp: result.rows[0].current_time,
      version: result.rows[0].db_version.split(' ')[0] + ' ' + result.rows[0].db_version.split(' ')[1],
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

/**
 * Run a migration from a SQL file
 * @param filePath Path to the SQL migration file (relative to project root)
 * @returns Success status and any error messages
 */
export async function runMigration(filePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Resolve absolute path
    const absolutePath = path.resolve(process.cwd(), filePath);
    
    // Read SQL file
    const sql = await fs.readFile(absolutePath, 'utf-8');
    
    console.log(`Executing migration: ${filePath}`);
    const start = Date.now();
    
    // Execute migration SQL directly (migrations contain their own BEGIN/COMMIT)
    await pool.query(sql);
    
    const duration = Date.now() - start;
    console.log(`Migration completed successfully in ${duration}ms: ${filePath}`);
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Migration failed: ${filePath}`, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Close all connections in the pool
 * Should be called when shutting down the application
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database connection pool closed');
}

// Export the pool for direct access if needed
export { pool };

export default {
  query,
  transaction,
  testConnection,
  closePool,
  runMigration,
  pool,
};
