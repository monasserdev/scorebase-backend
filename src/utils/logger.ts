/**
 * Structured Logging Module
 * 
 * Provides structured JSON logging functions for consistent logging across
 * the application. All logs include request_id, timestamp, and relevant context.
 * Implements PII sanitization to exclude sensitive data.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 10.11
 */

/**
 * Log levels
 */
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Base log entry structure
 */
interface BaseLogEntry {
  timestamp: string;
  level: LogLevel;
  request_id?: string;
  tenant_id?: string;
  user_id?: string;
}

/**
 * API request log entry
 */
interface RequestLogEntry extends BaseLogEntry {
  log_type: 'API_REQUEST';
  method: string;
  path: string;
  status_code: number;
  latency_ms: number;
}

/**
 * Authentication log entry
 */
interface AuthenticationLogEntry extends BaseLogEntry {
  log_type: 'AUTHENTICATION';
  success: boolean;
  reason?: string;
  username?: string;
}

/**
 * Authorization log entry
 */
interface AuthorizationLogEntry extends BaseLogEntry {
  log_type: 'AUTHORIZATION';
  success: boolean;
  action: string;
  resource: string;
  required_role?: string;
  user_roles?: string[];
}

/**
 * Database error log entry
 */
interface DatabaseLogEntry extends BaseLogEntry {
  log_type: 'DATABASE_ERROR';
  error_message: string;
  query_preview: string;
  operation: string;
}

/**
 * Security violation log entry
 */
interface SecurityLogEntry extends BaseLogEntry {
  log_type: 'SECURITY_VIOLATION';
  violation_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  context: Record<string, any>;
}

/**
 * PII patterns to sanitize from logs
 */
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
};

/**
 * Fields that may contain PII and should be excluded
 */
const PII_FIELDS = [
  'player_name',
  'first_name',
  'last_name',
  'full_name',
  'email',
  'phone',
  'phone_number',
  'address',
  'street',
  'city',
  'postal_code',
  'zip_code',
  'ssn',
  'date_of_birth',
  'dob',
];

/**
 * Sanitize string by removing PII patterns
 */
function sanitizeString(value: string): string {
  let sanitized = value;
  
  // Replace email addresses
  sanitized = sanitized.replace(PII_PATTERNS.email, '[EMAIL_REDACTED]');
  
  // Replace phone numbers
  sanitized = sanitized.replace(PII_PATTERNS.phone, '[PHONE_REDACTED]');
  
  // Replace SSNs
  sanitized = sanitized.replace(PII_PATTERNS.ssn, '[SSN_REDACTED]');
  
  return sanitized;
}

/**
 * Sanitize object by removing PII fields and patterns
 */
function sanitizeObject(obj: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip PII fields entirely
    if (PII_FIELDS.includes(key.toLowerCase())) {
      sanitized[key] = '[PII_REDACTED]';
      continue;
    }
    
    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value);
    }
    // Sanitize arrays
    else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'object' && item !== null
          ? sanitizeObject(item)
          : typeof item === 'string'
          ? sanitizeString(item)
          : item
      );
    }
    // Sanitize strings
    else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    }
    // Keep other types as-is
    else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Write log entry to console (CloudWatch)
 */
function writeLog(entry: BaseLogEntry & Record<string, any>): void {
  const logMethod = entry.level === LogLevel.ERROR ? console.error : console.log;
  logMethod(JSON.stringify(entry));
}

/**
 * Log API request
 * 
 * Logs all API requests with method, path, tenant_id, user_id, status code,
 * and latency. Used for request tracing and performance monitoring.
 * 
 * @param params - Request log parameters
 * 
 * @example
 * ```typescript
 * logRequest({
 *   requestId: 'abc-123',
 *   method: 'GET',
 *   path: '/v1/leagues',
 *   tenantId: 'tenant-123',
 *   userId: 'user-456',
 *   statusCode: 200,
 *   latencyMs: 45
 * });
 * ```
 */
export function logRequest(params: {
  requestId: string;
  method: string;
  path: string;
  tenantId: string;
  userId: string;
  statusCode: number;
  latencyMs: number;
}): void {
  const entry: RequestLogEntry = {
    timestamp: new Date().toISOString(),
    level: params.statusCode >= 500 ? LogLevel.ERROR : params.statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO,
    log_type: 'API_REQUEST',
    request_id: params.requestId,
    tenant_id: params.tenantId,
    user_id: params.userId,
    method: params.method,
    path: params.path,
    status_code: params.statusCode,
    latency_ms: params.latencyMs,
  };
  
  writeLog(entry);
}

/**
 * Log authentication attempt
 * 
 * Logs both successful and failed authentication attempts for security
 * monitoring and audit trails.
 * 
 * @param params - Authentication log parameters
 * 
 * @example
 * ```typescript
 * // Success
 * logAuthentication({
 *   requestId: 'abc-123',
 *   success: true,
 *   tenantId: 'tenant-123',
 *   userId: 'user-456',
 *   username: 'john.doe'
 * });
 * 
 * // Failure
 * logAuthentication({
 *   requestId: 'abc-123',
 *   success: false,
 *   reason: 'Token expired'
 * });
 * ```
 */
export function logAuthentication(params: {
  requestId: string;
  success: boolean;
  tenantId?: string;
  userId?: string;
  username?: string;
  reason?: string;
}): void {
  const entry: AuthenticationLogEntry = {
    timestamp: new Date().toISOString(),
    level: params.success ? LogLevel.INFO : LogLevel.WARN,
    log_type: 'AUTHENTICATION',
    request_id: params.requestId,
    tenant_id: params.tenantId,
    user_id: params.userId,
    success: params.success,
    username: params.username,
    reason: params.reason,
  };
  
  writeLog(entry);
}

/**
 * Log authorization check
 * 
 * Logs authorization failures with attempted action and resource for
 * security monitoring and debugging permission issues.
 * 
 * @param params - Authorization log parameters
 * 
 * @example
 * ```typescript
 * logAuthorization({
 *   requestId: 'abc-123',
 *   tenantId: 'tenant-123',
 *   userId: 'user-456',
 *   success: false,
 *   action: 'POST /v1/games/{gameId}/events',
 *   resource: 'game-789',
 *   requiredRole: 'scorekeeper',
 *   userRoles: ['viewer']
 * });
 * ```
 */
export function logAuthorization(params: {
  requestId: string;
  tenantId: string;
  userId: string;
  success: boolean;
  action: string;
  resource: string;
  requiredRole?: string;
  userRoles?: string[];
}): void {
  const entry: AuthorizationLogEntry = {
    timestamp: new Date().toISOString(),
    level: params.success ? LogLevel.INFO : LogLevel.WARN,
    log_type: 'AUTHORIZATION',
    request_id: params.requestId,
    tenant_id: params.tenantId,
    user_id: params.userId,
    success: params.success,
    action: params.action,
    resource: params.resource,
    required_role: params.requiredRole,
    user_roles: params.userRoles,
  };
  
  writeLog(entry);
}

/**
 * Log database error
 * 
 * Logs database errors with sanitized query preview and error message.
 * Excludes sensitive data and PII from logs.
 * 
 * @param params - Database error log parameters
 * 
 * @example
 * ```typescript
 * logDatabase({
 *   requestId: 'abc-123',
 *   tenantId: 'tenant-123',
 *   errorMessage: 'Connection timeout',
 *   query: 'SELECT * FROM games WHERE tenant_id = $1',
 *   operation: 'SELECT'
 * });
 * ```
 */
export function logDatabase(params: {
  requestId?: string;
  tenantId?: string;
  errorMessage: string;
  query: string;
  operation: string;
}): void {
  // Sanitize query to remove potential PII
  const sanitizedQuery = sanitizeString(params.query);
  
  // Truncate query for logging (first 200 characters)
  const queryPreview = sanitizedQuery.length > 200
    ? sanitizedQuery.substring(0, 200) + '...'
    : sanitizedQuery;
  
  const entry: DatabaseLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.ERROR,
    log_type: 'DATABASE_ERROR',
    request_id: params.requestId,
    tenant_id: params.tenantId,
    error_message: params.errorMessage,
    query_preview: queryPreview,
    operation: params.operation,
  };
  
  writeLog(entry);
}

/**
 * Log security violation
 * 
 * Logs security violations with violation type and context for security
 * monitoring and incident response.
 * 
 * @param params - Security violation log parameters
 * 
 * @example
 * ```typescript
 * logSecurity({
 *   requestId: 'abc-123',
 *   tenantId: 'tenant-123',
 *   userId: 'user-456',
 *   violationType: 'CROSS_TENANT_ACCESS_ATTEMPT',
 *   severity: 'HIGH',
 *   context: {
 *     attempted_tenant_id: 'tenant-789',
 *     resource: 'league-123'
 *   }
 * });
 * ```
 */
export function logSecurity(params: {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  violationType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  context: Record<string, any>;
}): void {
  // Sanitize context to remove PII
  const sanitizedContext = sanitizeObject(params.context);
  
  const entry: SecurityLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.ERROR,
    log_type: 'SECURITY_VIOLATION',
    request_id: params.requestId,
    tenant_id: params.tenantId,
    user_id: params.userId,
    violation_type: params.violationType,
    severity: params.severity,
    context: sanitizedContext,
  };
  
  writeLog(entry);
}

/**
 * Log generic message with context
 * 
 * General-purpose logging function for custom log entries.
 * Automatically sanitizes context to remove PII.
 * 
 * @param level - Log level
 * @param message - Log message
 * @param context - Additional context (will be sanitized)
 * 
 * @example
 * ```typescript
 * log(LogLevel.INFO, 'Standings recalculated', {
 *   request_id: 'abc-123',
 *   tenant_id: 'tenant-123',
 *   season_id: 'season-456',
 *   duration_ms: 150
 * });
 * ```
 */
export function log(
  level: LogLevel,
  message: string,
  context?: Record<string, any>
): void {
  const sanitizedContext = context ? sanitizeObject(context) : {};
  
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...sanitizedContext,
  };
  
  writeLog(entry);
}
