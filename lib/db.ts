import { Pool, QueryResult, QueryResultRow, PoolClient } from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';

type DbConfig = {
  connectionName?: string;
  databaseUrl?: string;
  user?: string;
  password?: string;
  database?: string;
};

const ipType: IpAddressTypes =
  (process.env.CLOUD_SQL_IP_TYPE as IpAddressTypes) || 'PUBLIC';

// Lazy evaluation of config to support dotenv loading after import
const getShareviewConfig = (): DbConfig => ({
  connectionName: process.env.SV_CLOUD_SQL_CONNECTION_NAME || process.env.CLOUD_SQL_CONNECTION_NAME,
  databaseUrl: process.env.SV_DATABASE_URL || process.env.DATABASE_URL,
  user: process.env.SV_DBUSER || process.env.PGUSER,
  password: process.env.SV_DBPASSWORD || process.env.PGPASSWORD,
  database: process.env.SV_DBNAME || process.env.PGDATABASE,
});

const getAnalyticsConfig = (): DbConfig => ({
  connectionName: process.env.RSR_CLOUD_SQL_CONNECTION_NAME,
  databaseUrl: process.env.RSR_DATABASE_URL,
  user: process.env.RSR_DBUSER,
  password: process.env.RSR_DBPASSWORD,
  database: process.env.RSR_DBNAME,
});

let connector: Connector | null = null;
let hasLoggedConnections = false;
const shouldLogQueries = process.env.LOG_DB_QUERIES === '1';

/** Returns true for transient connection errors that are safe to retry once. */
const isTransientConnectionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  // Exclude genuine timeout errors — retrying immediately won't help and masks the problem
  if (msg.includes('connection timeout') || msg.includes('timeout expired')) return false;
  return (
    msg.includes('connection terminated') ||
    msg.includes('connection closed') ||
    msg.includes('client was closed') ||
    (error as NodeJS.ErrnoException).code === 'ECONNRESET' ||
    (error as NodeJS.ErrnoException).code === 'EPIPE'
  );
};

const getConnector = () => {
  if (!connector) {
    connector = new Connector();
  }
  return connector;
};

const createPool = async (config: DbConfig, label: string): Promise<Pool> => {
  if (config.connectionName) {
    const connectorInstance = getConnector();
    const clientOpts = await connectorInstance.getOptions({
      instanceConnectionName: config.connectionName,
      ipType,
    });
    const pool = new Pool({
      ...clientOpts,
      user: config.user,
      password: config.password,
      database: config.database,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
    pool.on('error', (err) => {
      console.error(`Unexpected error on idle client (${label})`, err);
    });
    return pool;
  }

  if (config.databaseUrl) {
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    pool.on('error', (err) => {
      console.error(`Unexpected error on idle client (${label})`, err);
    });
    return pool;
  }

  throw new Error(`Database configuration missing for ${label}.`);
};

// Use globalThis so pool instances survive Turbopack / Next.js hot-reloads in development.
// Without this, every file-save creates a new Pool (max: N connections) while the old
// pool's connections are still open on the Cloud SQL proxy, quickly exhausting its limit.
declare global {
  // eslint-disable-next-line no-var
  var __sv_pool_promise: Promise<Pool> | undefined;
  // eslint-disable-next-line no-var
  var __analytics_pool_promise: Promise<Pool> | undefined;
}

const getShareviewPool = async () => {
  if (!globalThis.__sv_pool_promise) {
    globalThis.__sv_pool_promise = createPool(getShareviewConfig(), 'shareview');
  }
  return globalThis.__sv_pool_promise;
};

const getAnalyticsPool = async () => {
  if (!globalThis.__analytics_pool_promise) {
    globalThis.__analytics_pool_promise = createPool(getAnalyticsConfig(), 'retailer-analytics');
  }
  return globalThis.__analytics_pool_promise;
};

const hasConfig = (config: DbConfig) => Boolean(config.connectionName || config.databaseUrl);

const logPoolStatus = async (label: string, poolPromise: Promise<Pool>) => {
  try {
    const pool = await poolPromise;
    await pool.query('SELECT 1');
    console.info(`[db] ${label}: connected`);
  } catch (error) {
    console.error(`[db] ${label}: connection failed`, error);
  }
};

export const logDbConnectionsOnce = async () => {
  if (hasLoggedConnections) return;
  hasLoggedConnections = true;

  if (hasConfig(getShareviewConfig())) {
    await logPoolStatus('shareview', getShareviewPool());
  } else {
    console.info('[db] shareview: not configured');
  }

  if (hasConfig(getAnalyticsConfig())) {
    await logPoolStatus('retailer-analytics', getAnalyticsPool());
  } else {
    console.info('[db] retailer-analytics: not configured');
  }
};

/**
 * Execute a SQL query with optional parameters
 * @param text SQL query string (use $1, $2, etc. for parameters)
 * @param params Query parameters
 * @returns Query result
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: Array<unknown>
): Promise<QueryResult<T>> {
  const start = Date.now();
  const attempt = async () => {
    const pool = await getShareviewPool();
    return pool.query<T>(text, params);
  };
  try {
    const result = await attempt();
    const duration = Date.now() - start;
    if (shouldLogQueries) {
      console.log('Executed query', { text, duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    if (isTransientConnectionError(error)) {
      console.warn('[db] Transient connection error – retrying once:', (error as Error).message);
      try {
        const result = await attempt();
        const duration = Date.now() - start;
        if (shouldLogQueries) {
          console.log('Executed query (retry)', { text, duration, rows: result.rowCount });
        }
        return result;
      } catch (retryError) {
        console.error('Database query error after retry:', retryError);
        throw retryError;
      }
    }
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
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = await getShareviewPool();
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

export async function queryAnalytics<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: Array<unknown>
): Promise<QueryResult<T>> {
  const start = Date.now();
  const attempt = async () => {
    const pool = await getAnalyticsPool();
    return pool.query<T>(text, params);
  };
  try {
    const result = await attempt();
    const duration = Date.now() - start;
    if (shouldLogQueries) {
      console.log('Executed analytics query', { text, duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    if (isTransientConnectionError(error)) {
      console.warn('[db] Transient analytics connection error – retrying once:', (error as Error).message);
      try {
        const result = await attempt();
        const duration = Date.now() - start;
        if (shouldLogQueries) {
          console.log('Executed analytics query (retry)', { text, duration, rows: result.rowCount });
        }
        return result;
      } catch (retryError) {
        console.error('Analytics database query error after retry:', retryError);
        throw retryError;
      }
    }
    console.error('Analytics database query error:', error);
    throw error;
  }
}

export async function transactionAnalytics<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = await getAnalyticsPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Analytics transaction error:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function testAnalyticsConnection(): Promise<void> {
  try {
    const result = await queryAnalytics('SELECT NOW() as current_time, version() as db_version');
    console.log('Analytics database connection successful:', {
      timestamp: result.rows[0].current_time,
      version: result.rows[0].db_version.split(' ')[0] + ' ' + result.rows[0].db_version.split(' ')[1],
    });
  } catch (error) {
    console.error('Analytics database connection failed:', error);
    throw error;
  }
}

/**
 * Close all connections in the pool
 * Should be called when shutting down the application
 */
export async function closePool(): Promise<void> {
  if (globalThis.__sv_pool_promise) {
    const pool = await globalThis.__sv_pool_promise;
    await pool.end();
  }
  if (globalThis.__analytics_pool_promise) {
    const pool = await globalThis.__analytics_pool_promise;
    await pool.end();
  }
  if (connector) {
    connector.close();
  }
  console.log('Database connection pools closed');
}

export async function getAnalyticsNetworkId(slug: string): Promise<string | null> {
  const sfData = await query("SELECT retailer_name FROM retailer_metadata WHERE retailer_id = $1", [slug]);
  if (sfData.rows.length === 0) return null;
  const name = sfData.rows[0].retailer_name;

  // Try exact match first, then try partial match (e.g., "Boots" matches "Boots UK")
  let anData = await queryAnalytics(
    "SELECT retailer_id FROM retailer_metadata WHERE LOWER(retailer_name) = LOWER($1)",
    [name]
  );
  
  if (anData.rows.length === 0) {
    // Try partial match - the analytics DB might have more detailed names
    anData = await queryAnalytics(
      "SELECT retailer_id FROM retailer_metadata WHERE LOWER(retailer_name) LIKE LOWER($1) || '%'",
      [name]
    );
  }
  
  if (anData.rows.length === 0) return null;
  return anData.rows[0].retailer_id as string;
}

export async function getAnalyticsNetworkIds(slugs: string[]): Promise<string[]> {
  if (!slugs || slugs.length === 0) return [];
  const sfData = await query("SELECT retailer_id, retailer_name FROM retailer_metadata WHERE retailer_id = ANY($1)", [slugs]);
  if (sfData.rows.length === 0) return [];

  const results: string[] = [];
  
  for (const row of sfData.rows) {
    const name = row.retailer_name;
    
    // Try exact match first
    let anData = await queryAnalytics(
      "SELECT retailer_id FROM retailer_metadata WHERE LOWER(retailer_name) = LOWER($1)",
      [name]
    );
    
    if (anData.rows.length === 0) {
      // Try partial match
      anData = await queryAnalytics(
        "SELECT retailer_id FROM retailer_metadata WHERE LOWER(retailer_name) LIKE LOWER($1) || '%'",
        [name]
      );
    }
    
    if (anData.rows.length > 0) {
      results.push(anData.rows[0].retailer_id as string);
    }
  }
  
  return results;
}

const db = {
  query,
  transaction,
  testConnection,
  queryAnalytics,
  transactionAnalytics,
  testAnalyticsConnection,
  logDbConnectionsOnce,
  closePool,
  getShareviewPool,
  getAnalyticsPool,
  getAnalyticsNetworkId,
  getAnalyticsNetworkIds,
};

export default db;
