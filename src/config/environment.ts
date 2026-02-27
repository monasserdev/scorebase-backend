/**
 * Environment Configuration
 * 
 * Centralized configuration management for environment variables.
 * All configuration values should be accessed through this module.
 */

export interface EnvironmentConfig {
  // Database configuration
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbSecretArn: string;

  // DynamoDB configuration
  dynamodbTableName: string;
  websocketConnectionsTableName: string;

  // S3 configuration
  s3ArchiveBucket: string;

  // Cognito configuration
  cognitoUserPoolId: string;

  // Application configuration
  logLevel: string;
  nodeEnv: string;
}

/**
 * Load and validate environment configuration
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  return {
    dbHost: process.env.DB_HOST || '',
    dbPort: parseInt(process.env.DB_PORT || '5432', 10),
    dbName: process.env.DB_NAME || '',
    dbSecretArn: process.env.DB_SECRET_ARN || '',
    dynamodbTableName: process.env.DYNAMODB_TABLE_NAME || '',
    websocketConnectionsTableName: process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME || 'scorebase-websocket-connections',
    s3ArchiveBucket: process.env.S3_ARCHIVE_BUCKET || '',
    cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || '',
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

/**
 * Validate that all required environment variables are set
 */
export function validateEnvironmentConfig(config: EnvironmentConfig): void {
  const requiredFields: (keyof EnvironmentConfig)[] = [
    'dbHost',
    'dbName',
    'dbSecretArn',
    'dynamodbTableName',
    's3ArchiveBucket',
    'cognitoUserPoolId',
  ];

  const missingFields = requiredFields.filter((field) => !config[field]);

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingFields.join(', ')}`
    );
  }
}
