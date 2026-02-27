/**
 * Event Repository
 * 
 * Data access layer for game events with multi-tenant isolation.
 * Manages event persistence in DynamoDB with idempotency support and reversal tracking.
 * 
 * Requirements: 13.1, 15.1
 */

import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDBClient } from '../config/dynamodb';
import { GameEvent, EventType } from '../models/event';
import { loadEnvironmentConfig } from '../config/environment';

/**
 * Event Repository
 * Provides data access methods for game events with tenant isolation
 */
export class EventRepository {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private idempotencyGsiName: string;

  constructor() {
    this.client = getDynamoDBClient();
    const config = loadEnvironmentConfig();
    this.tableName = config.dynamodbTableName;
    this.idempotencyGsiName = 'idempotency-key-index';
  }

  /**
   * Find event by idempotency key
   * 
   * Uses the idempotency-key-index GSI to query for events by idempotency key.
   * Enforces tenant isolation by querying with tenant_id as partition key.
   * 
   * @param tenantId - Tenant identifier for multi-tenant isolation
   * @param idempotencyKey - Idempotency key to search for
   * @returns Event if found, null otherwise
   * 
   * Requirements: 13.1, 13.5
   */
  async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<GameEvent | null> {
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: this.idempotencyGsiName,
          KeyConditionExpression: 'tenant_id = :tenant_id AND idempotency_key = :idempotency_key',
          ExpressionAttributeValues: {
            ':tenant_id': tenantId,
            ':idempotency_key': idempotencyKey,
          },
          Limit: 1,
        })
      );

      if (result.Items && result.Items.length > 0) {
        return result.Items[0] as GameEvent;
      }

      return null;
    } catch (error) {
      throw new Error(`Failed to find event by idempotency key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if an event has been reversed
   * 
   * Queries for EVENT_REVERSAL events that reference the given event_id.
   * An event is considered reversed if there exists an EVENT_REVERSAL event
   * with reversed_event_id matching the given event_id.
   * 
   * @param tenantId - Tenant identifier for multi-tenant isolation
   * @param eventId - Event identifier to check for reversal
   * @returns True if event has been reversed, false otherwise
   * 
   * Requirements: 15.1, 15.2
   */
  async isEventReversed(tenantId: string, eventId: string): Promise<boolean> {
    try {
      // Query the tenant-events-index GSI to find all events for this tenant
      // Then filter for EVENT_REVERSAL events that reference this event_id
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'tenant-events-index',
          KeyConditionExpression: 'tenant_id = :tenant_id',
          FilterExpression: 'event_type = :event_type AND payload.reversed_event_id = :event_id',
          ExpressionAttributeValues: {
            ':tenant_id': tenantId,
            ':event_type': EventType.EVENT_REVERSAL,
            ':event_id': eventId,
          },
          Limit: 1,
        })
      );

      return result.Items !== undefined && result.Items.length > 0;
    } catch (error) {
      throw new Error(`Failed to check if event is reversed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
