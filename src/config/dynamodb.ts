/**
 * DynamoDB Client Module
 * 
 * Provides DynamoDB client wrapper for event operations.
 * Handles event persistence with TTL calculation and chronological ordering.
 * 
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { loadEnvironmentConfig } from './environment';
import {
  GameEvent,
  CreateEventParams,
  GetEventsParams,
} from '../models/event';
import { emitEventWriteLatency } from '../utils/metrics';

// Global DynamoDB client instance for Lambda warm starts
let dynamodbClient: DynamoDBDocumentClient | null = null;

/**
 * TTL duration in days for event retention
 */
const EVENT_TTL_DAYS = 90;

/**
 * Event schema version
 */
const EVENT_VERSION = '1.0';

/**
 * WebSocket connections table name
 */
export const WEBSOCKET_CONNECTIONS_TABLE = 'scorebase-websocket-connections';

/**
 * WebSocket connections GSI for game-based queries
 */
export const GAME_CONNECTIONS_INDEX = 'game-connections-index';

/**
 * Get or create the DynamoDB DocumentClient
 * Reuses client across Lambda invocations for performance
 */
export function getDynamoDBClient(): DynamoDBDocumentClient {
  if (!dynamodbClient) {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    
    // Create DocumentClient with marshalling options
    dynamodbClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: false,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
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
 * @param options - Optional parameters for idempotency, occurred_at, and spatial coordinates
 * @returns Created event
 */
export async function writeEvent(
  params: CreateEventParams,
  options?: {
    occurred_at?: string;
    idempotency_key?: string;
    spatial_coordinates?: { x: number; y: number; zone?: string };
  }
): Promise<GameEvent> {
  const startTime = Date.now();
  const client = getDynamoDBClient();
  const config = loadEnvironmentConfig();

  const event_id = uuidv4();
  const occurred_at = options?.occurred_at || new Date().toISOString();
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

  // Add optional fields if provided
  if (options?.idempotency_key) {
    event.idempotency_key = options.idempotency_key;
  }

  if (options?.spatial_coordinates) {
    event.spatial_coordinates = options.spatial_coordinates;
  }

  try {
    await client.send(
      new PutCommand({
        TableName: config.dynamodbTableName,
        Item: event,
      })
    );

    // Emit metric for event write latency
    const latency = Date.now() - startTime;
    await emitEventWriteLatency(params.tenant_id, params.event_type, latency);

    return event;
  } catch (error) {
    // Emit metric even on error
    const latency = Date.now() - startTime;
    await emitEventWriteLatency(params.tenant_id, params.event_type, latency);
    throw error;
  }
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

  const result = await client.send(
    new QueryCommand({
      TableName: config.dynamodbTableName,
      KeyConditionExpression: 'game_id = :game_id',
      FilterExpression: 'tenant_id = :tenant_id',
      ExpressionAttributeValues: {
        ':game_id': game_id,
        ':tenant_id': tenant_id,
      },
      ScanIndexForward: true, // Chronological order (ascending)
    })
  );

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

  const queryParams: any = {
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
    queryParams.ExpressionAttributeValues[':start_key'] = `${params.start_date}#`;
    queryParams.ExpressionAttributeValues[':end_key'] = `${params.end_date}#\uffff`;
  } else if (params.start_date) {
    queryParams.KeyConditionExpression += ' AND sort_key >= :start_key';
    queryParams.ExpressionAttributeValues[':start_key'] = `${params.start_date}#`;
  } else if (params.end_date) {
    queryParams.KeyConditionExpression += ' AND sort_key <= :end_key';
    queryParams.ExpressionAttributeValues[':end_key'] = `${params.end_date}#\uffff`;
  }

  // Add limit if provided
  if (params.limit) {
    queryParams.Limit = params.limit;
  }

  const result = await client.send(new QueryCommand(queryParams));

  return (result.Items || []) as GameEvent[];
}

/**
 * Reset DynamoDB client instance (for testing only)
 * @internal
 */
export function resetDynamoDBClient(): void {
  dynamodbClient = null;
}
