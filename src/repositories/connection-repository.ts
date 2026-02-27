/**
 * Connection Repository
 * 
 * Data access layer for WebSocket connections with multi-tenant isolation.
 * Manages connection metadata in DynamoDB for real-time game synchronization.
 * 
 * Requirements: 4.1, 11.1, 11.2
 */

import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDBClient } from '../config/dynamodb';
import { WebSocketConnection } from '../models/websocket';
import { loadEnvironmentConfig } from '../config/environment';

/**
 * Connection Repository
 * Provides data access methods for WebSocket connections with tenant isolation
 */
export class ConnectionRepository {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private gsiName: string;

  constructor() {
    this.client = getDynamoDBClient();
    const config = loadEnvironmentConfig();
    this.tableName = config.websocketConnectionsTableName || 'scorebase-websocket-connections';
    this.gsiName = 'game-connections-index';
  }

  /**
   * Store connection metadata in DynamoDB
   * 
   * @param connection - Connection metadata to store
   */
  async storeConnection(connection: WebSocketConnection): Promise<void> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: connection,
        })
      );
    } catch (error) {
      throw new Error(`Failed to store connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove connection metadata from DynamoDB
   * 
   * @param connectionId - Connection identifier to remove
   */
  async removeConnection(connectionId: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            connection_id: connectionId,
          },
        })
      );
    } catch (error) {
      throw new Error(`Failed to remove connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all active connections for a game with tenant filtering
   * 
   * Uses GSI to query by game_id, then filters by tenant_id for multi-tenant isolation.
   * 
   * @param gameId - Game identifier
   * @param tenantId - Tenant identifier for filtering
   * @returns Array of active connections for the game belonging to the tenant
   */
  async getConnectionsByGame(gameId: string, tenantId: string): Promise<WebSocketConnection[]> {
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: this.gsiName,
          KeyConditionExpression: 'game_id = :game_id',
          FilterExpression: 'tenant_id = :tenant_id',
          ExpressionAttributeValues: {
            ':game_id': gameId,
            ':tenant_id': tenantId,
          },
        })
      );

      return (result.Items || []) as WebSocketConnection[];
    } catch (error) {
      throw new Error(`Failed to get connections by game: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get connection by ID
   * 
   * @param connectionId - Connection identifier
   * @returns Connection metadata or null if not found
   */
  async getConnection(connectionId: string): Promise<WebSocketConnection | null> {
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            connection_id: connectionId,
          },
        })
      );

      return result.Item ? (result.Item as WebSocketConnection) : null;
    } catch (error) {
      throw new Error(`Failed to get connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
