/**
 * Multi-Tenant Isolation Middleware
 * 
 * Enforces strict tenant isolation at the database query level.
 * Validates that all queries include tenant_id filtering and verifies
 * that all results belong to the requesting tenant.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { QueryResult, QueryResultRow } from 'pg';
import { query as dbQuery } from '../config/database';
import { logSecurity } from '../utils/logger';
import { emitCrossTenantAccessAttempt } from '../utils/metrics';

/**
 * Multi-tenant isolation error types
 */
export enum TenantIsolationErrorCode {
  INVALID_TENANT_ID = 'INVALID_TENANT_ID',
  QUERY_MISSING_TENANT_FILTER = 'QUERY_MISSING_TENANT_FILTER',
  TENANT_ISOLATION_VIOLATION = 'TENANT_ISOLATION_VIOLATION',
}

/**
 * Multi-tenant isolation error
 */
export class TenantIsolationError extends Error {
  constructor(
    public code: TenantIsolationErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

/**
 * UUID validation regex
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a tenant_id is a valid UUID
 */
function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Log security violation using structured logging
 */
function logSecurityViolation(
  tenantId: string,
  violationType: string,
  details: any
): void {
  logSecurity({
    tenantId: tenantId === 'UNKNOWN' ? undefined : tenantId,
    violationType,
    severity: 'HIGH',
    context: details,
  });
  
  // Emit CloudWatch metric for cross-tenant access attempts
  emitCrossTenantAccessAttempt(
    tenantId === 'UNKNOWN' ? 'UNKNOWN' : tenantId,
    violationType
  ).catch(error => {
    // Log error but don't throw - metrics should not break application flow
    console.error('Failed to emit cross-tenant access metric', {
      tenantId,
      violationType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });
}

/**
 * Enforce multi-tenant isolation query wrapper
 * 
 * This function wraps database queries to ensure:
 * 1. tenant_id is present and valid
 * 2. Query includes tenant_id filter in WHERE clause
 * 3. All results belong to the requesting tenant
 * 4. Security violations are logged to CloudWatch
 * 
 * @param tenantId - Tenant identifier from JWT claims
 * @param queryText - SQL query with $1 placeholder for tenant_id
 * @param params - Additional query parameters (tenant_id will be prepended)
 * @returns Query result with tenant isolation enforced
 * @throws TenantIsolationError for isolation violations
 */
export async function enforceMultiTenantIsolation<T extends QueryResultRow = any>(
  tenantId: string,
  queryText: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  // Step 1: Validate tenant_id is present and valid UUID
  if (!tenantId) {
    const error = new TenantIsolationError(
      TenantIsolationErrorCode.INVALID_TENANT_ID,
      'tenant_id is required for all database queries'
    );
    
    logSecurityViolation('UNKNOWN', 'MISSING_TENANT_ID', {
      query: queryText,
    });
    
    throw error;
  }

  if (!isValidUUID(tenantId)) {
    const error = new TenantIsolationError(
      TenantIsolationErrorCode.INVALID_TENANT_ID,
      'tenant_id must be a valid UUID',
      { tenant_id: tenantId }
    );
    
    logSecurityViolation(tenantId, 'INVALID_TENANT_ID_FORMAT', {
      tenant_id: tenantId,
      query: queryText,
    });
    
    throw error;
  }

  // Step 2: Ensure query includes tenant_id filter
  const normalizedQuery = queryText.toLowerCase().replace(/\s+/g, ' ').trim();
  
  if (!normalizedQuery.includes('tenant_id')) {
    const error = new TenantIsolationError(
      TenantIsolationErrorCode.QUERY_MISSING_TENANT_FILTER,
      'Query must include tenant_id filter in WHERE clause',
      { query: queryText }
    );
    
    logSecurityViolation(tenantId, 'QUERY_MISSING_TENANT_FILTER', {
      tenant_id: tenantId,
      query: queryText,
    });
    
    throw error;
  }

  // Step 3: Execute query with tenant_id as first parameter
  // Prepend tenant_id to params array
  const finalParams = [tenantId, ...params];
  
  let result: QueryResult<T>;
  try {
    result = await dbQuery<T>(queryText, finalParams);
  } catch (error) {
    // Log database errors but don't expose details
    console.error('Database query failed', {
      tenant_id: tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
      query: queryText.substring(0, 100), // Truncate for logging
    });
    throw error;
  }

  // Step 4: Verify all results belong to requesting tenant (defense in depth)
  for (const row of result.rows) {
    const rowTenantId = (row as any).tenant_id;
    
    if (rowTenantId && rowTenantId !== tenantId) {
      const error = new TenantIsolationError(
        TenantIsolationErrorCode.TENANT_ISOLATION_VIOLATION,
        'Query returned data belonging to a different tenant',
        {
          expected_tenant_id: tenantId,
          actual_tenant_id: rowTenantId,
        }
      );
      
      logSecurityViolation(tenantId, 'CROSS_TENANT_DATA_LEAKAGE', {
        expected_tenant_id: tenantId,
        actual_tenant_id: rowTenantId,
        query: queryText.substring(0, 100),
        row_count: result.rows.length,
      });
      
      throw error;
    }
  }

  return result;
}

/**
 * Convenience wrapper for queries that return a single row
 * Returns null if no row found
 */
export async function enforceMultiTenantIsolationSingle<T extends QueryResultRow = any>(
  tenantId: string,
  queryText: string,
  params: any[] = []
): Promise<T | null> {
  const result = await enforceMultiTenantIsolation<T>(tenantId, queryText, params);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Convenience wrapper for queries that return multiple rows
 * Returns empty array if no rows found
 */
export async function enforceMultiTenantIsolationMany<T extends QueryResultRow = any>(
  tenantId: string,
  queryText: string,
  params: any[] = []
): Promise<T[]> {
  const result = await enforceMultiTenantIsolation<T>(tenantId, queryText, params);
  return result.rows;
}
