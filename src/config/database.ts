/**
 * Database Connection Pool Module
 * 
 * Provides PostgreSQL connection pooling optimized for AWS Lambda execution.
 * Implements connection reuse across Lambda invocations, parameterized queries,
 * and transaction support for atomic operations.
 * 
 * Requirements: 9.4, 10.3
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { loadEnvironmentConfig } from './environment';
import { logDatabase } from '../utils/logger';

// Global pool instance for Lambda warm starts
let pool: Pool | null = null;
let cachedCredentials: { username: string; password: string } | null = null;

/**
 * Database connection pool configuration
 */
interface PoolConfig {
  min: number;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

/**
 * Default pool configuration optimized for Lambda
 */
const DEFAULT_POOL_CONFIG: PoolConfig = {
  min: 5,
  max: 20,
  idleTimeoutMillis: 30000, // 30 seconds
  connectionTimeoutMillis: 5000, // 5 seconds
};

/**
 * Fetch database credentials from AWS Secrets Manager
 */
async function getCredentialsFromSecretsManager(secretArn: string): Promise<{ username: string; password: string }> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
  
  try {
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }
    
    const secret = JSON.parse(response.SecretString);
    cachedCredentials = {
      username: secret.username,
      password: secret.password,
    };
    
    return cachedCredentials;
  } catch (error) {
    console.error('Failed to fetch database credentials from Secrets Manager:', error);
    throw new Error(`Failed to fetch database credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get or create the database connection pool
 * Reuses pool across Lambda invocations for performance
 */
export async function getPool(): Promise<Pool> {
  if (!pool) {
    const config = loadEnvironmentConfig();
    
    // Fetch credentials from Secrets Manager
    const credentials = await getCredentialsFromSecretsManager(config.dbSecretArn);
    
    pool = new Pool({
      host: config.dbHost,
      port: config.dbPort,
      database: config.dbName,
      user: credentials.username,
      password: credentials.password,
      min: DEFAULT_POOL_CONFIG.min,
      max: DEFAULT_POOL_CONFIG.max,
      idleTimeoutMillis: DEFAULT_POOL_CONFIG.idleTimeoutMillis,
      connectionTimeoutMillis: DEFAULT_POOL_CONFIG.connectionTimeoutMillis,
      ssl: {
        rejectUnauthorized: false, // RDS uses self-signed certificates
      },
    });

    // Handle pool errors
    pool.on('error', (err) => {
      logDatabase({
        errorMessage: err.message,
        query: 'Pool error',
        operation: 'POOL_ERROR',
      });
    });
  }

  return pool;
}

/**
 * Execute a parameterized query
 * Prevents SQL injection by using parameterized queries
 * 
 * @param text - SQL query with $1, $2, etc. placeholders
 * @param params - Array of parameter values
 * @returns Query result
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = await getPool();
  return pool.query<T>(text, params);
}

/**
 * Transaction helper for atomic operations
 * Automatically handles BEGIN, COMMIT, and ROLLBACK
 * 
 * @param callback - Function to execute within transaction
 * @returns Result from callback
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close the database pool
 * Should be called during Lambda shutdown or testing cleanup
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Reset pool instance (for testing only)
 * @internal
 */
export function resetPool(): void {
  pool = null;
}

/**
 * Check if pool is healthy
 * Useful for health checks and monitoring
 */
export async function isPoolHealthy(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as health_check');
    return result.rows.length === 1 && result.rows[0].health_check === 1;
  } catch (error) {
    console.error('Pool health check failed:', error);
    return false;
  }
}
