/**
 * DynamoDB Client Module
 * 
 * Provides DynamoDB client wrapper for event operations.
 * Handles event persistence with TTL calculation and chronological ordering.
 * 
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import { DynamoDB } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { loadEnvironmentConfig } from './environment';
import {
  GameEvent,
  CreateEventParams,
  GetEventsParams,
} from '../models/event';

// Global DynamoDB client instance for Lambda warm starts
let dynamodbClient: DynamoDB.DocumentClient | null = null;

/**
 * TTL duration in days for event retention
 */
const EVENT_TTL_DAYS = 90;

/**
 * Event schema version
 */
const EVENT_VERSION = '1.0';

/**
 * Get or create the DynamoDB DocumentClient
 * Reuses client across Lambda invocations for performance
 */
export function getDynamoDBClient(): DynamoDB.DocumentClient {
  if (!dynamodbClient) {
    dynamodbClient = new DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return dynamodbClient;
}

/**
 * Calculate TTL timestamp (90 days from now)
 * 
 * @returns Unix timestamp for DynamoDB TTL
 */
function calculateTTL(): number {
  const now = new Date();
  const ttlDate = new Date(now.getTime() + EVENT_TTL_DAYS * 24 * 60 * 60 * 1000);
  return Math.floor(ttlDate.getTime() / 1000);
}

/**
 * Create sort key for chronological ordering
 * Format: occurred_at#event_id
 * 
 * @param occurred_at - ISO-8601 timestamp
 * @param event_id - Event UUID
 * @returns Sort key string
 */
function createSortKey(occurred_at: string, event_id: string): string {
  return `${occurred_at}#${event_id}`;
}

/**
 * Write event to DynamoDB with TTL calculation
 * 
 * @param params - Event creation parameters
 * @returns Created event
 */
export async function writeEvent(
  params: CreateEventParams
): Promise<GameEvent> {
  const client = getDynamoDBClient();
  const config = loadEnvironmentConfig();

  const event_id = uuidv4();
  const occurred_at = new Date().toISOString();
  const sort_key = createSortKey(occurred_at, event_id);
  const ttl = calculateTTL();

  const event: GameEvent = {
    event_id,
    game_id: params.game_id,
    tenant_id: params.tenant_id,
    event_type: params.event_type,
    event_version: EVENT_VERSION,
    occurred_at,
    sort_key,
    payload: params.payload,
    metadata: params.metadata,
    ttl,
  };

  await client
    .put({
      TableName: config.dynamodbTableName,
      Item: event,
    })
    .promise();

  return event;
}

/**
 * Get events by game ID with chronological ordering
 * 
 * @param game_id - Game identifier
 * @param tenant_id - Tenant identifier for validation
 * @returns Array of events in chronological order
 */
export async function getEventsByGame(
  game_id: string,
  tenant_id: string
): Promise<GameEvent[]> {
  const client = getDynamoDBClient();
  const config = loadEnvironmentConfig();

  const result = await client
    .query({
      TableName: config.dynamodbTableName,
      KeyConditionExpression: 'game_id = :game_id',
      FilterExpression: 'tenant_id = :tenant_id',
      ExpressionAttributeValues: {
        ':game_id': game_id,
        ':tenant_id': tenant_id,
      },
      ScanIndexForward: true, // Chronological order (ascending)
    })
    .promise();

  return (result.Items || []) as GameEvent[];
}

/**
 * Get events by tenant ID using GSI
 * 
 * @param params - Query parameters
 * @returns Array of events in chronological order
 */
export async function getEventsByTenant(
  params: GetEventsParams
): Promise<GameEvent[]> {
  const client = getDynamoDBClient();
  const config = loadEnvironmentConfig();

  if (!params.tenant_id) {
    throw new Error('tenant_id is required for getEventsByTenant');
  }

  const queryParams: DynamoDB.DocumentClient.QueryInput = {
    TableName: config.dynamodbTableName,
    IndexName: 'tenant-events-index',
    KeyConditionExpression: 'tenant_id = :tenant_id',
    ExpressionAttributeValues: {
      ':tenant_id': params.tenant_id,
    },
    ScanIndexForward: true, // Chronological order (ascending)
  };

  // Add date range filtering if provided
  if (params.start_date && params.end_date) {
    queryParams.KeyConditionExpression += ' AND sort_key BETWEEN :start_key AND :end_key';
    queryParams.ExpressionAttributeValues![':start_key'] = `${params.start_date}#`;
    queryParams.ExpressionAttributeValues![':end_key'] = `${params.end_date}#\uffff`;
  } else if (params.start_date) {
    queryParams.KeyConditionExpression += ' AND sort_key >= :start_key';
    queryParams.ExpressionAttributeValues![':start_key'] = `${params.start_date}#`;
  } else if (params.end_date) {
    queryParams.KeyConditionExpression += ' AND sort_key <= :end_key';
    queryParams.ExpressionAttributeValues![':end_key'] = `${params.end_date}#\uffff`;
  }

  // Add limit if provided
  if (params.limit) {
    queryParams.Limit = params.limit;
  }

  const result = await client.query(queryParams).promise();

  return (result.Items || []) as GameEvent[];
}

/**
 * Reset DynamoDB client instance (for testing only)
 * @internal
 */
export function resetDynamoDBClient(): void {
  dynamodbClient = null;
}
