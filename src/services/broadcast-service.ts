/**
 * Broadcast Service
 * 
 * Business logic layer for distributing game snapshots to WebSocket connections.
 * Handles real-time broadcasting of game state updates to connected clients
 * with multi-tenant isolation and connection failure handling.
 * 
 * Requirements: 4.5, 4.6, 8.3
 */

import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { ConnectionRepository } from '../repositories/connection-repository';
import { GameSnapshot } from '../models/snapshot';
import { WebSocketMessage } from '../models/websocket';
import { log, LogLevel } from '../utils/logger';
import { loadEnvironmentConfig } from '../config/environment';

/**
 * Broadcast Service
 * Provides business logic for distributing game snapshots to WebSocket connections
 */
export class BroadcastService {
  private apiGatewayClient: ApiGatewayManagementApiClient | null = null;
  private connectionRepository: ConnectionRepository;

  constructor(connectionRepository: ConnectionRepository) {
    this.connectionRepository = connectionRepository;
  }

  /**
   * Get or create API Gateway Management API client
   * Lazy initialization to avoid creating client when not needed
   * 
   * @returns API Gateway Management API client
   */
  private getApiGatewayClient(): ApiGatewayManagementApiClient {
    if (!this.apiGatewayClient) {
      const config = loadEnvironmentConfig();
      
      // API Gateway Management API endpoint is required for posting to connections
      // Format: https://{api-id}.execute-api.{region}.amazonaws.com/{stage}
      const endpoint = config.websocketApiEndpoint || process.env.WEBSOCKET_API_ENDPOINT;
      
      if (!endpoint) {
        throw new Error('WebSocket API endpoint not configured');
      }

      this.apiGatewayClient = new ApiGatewayManagementApiClient({
        endpoint,
        region: process.env.AWS_REGION || 'us-east-1',
      });
    }

    return this.apiGatewayClient;
  }

  /**
   * Broadcast game snapshot to all connected clients for a game
   * 
   * Queries all active connections for the game, filters by tenant_id for
   * multi-tenant isolation, and sends the snapshot to each connection.
   * Failed connections are automatically removed from the connection store.
   * 
   * Performance target: <50ms at p95
   * 
   * @param tenantId - Tenant identifier for filtering connections
   * @param gameId - Game identifier
   * @param snapshot - Game snapshot to broadcast
   * @param messageType - Type of message (initial_snapshot or snapshot_update)
   * 
   * Requirements: 4.5, 4.6, 5.2, 8.3
   */
  async broadcastSnapshot(
    tenantId: string,
    gameId: string,
    snapshot: GameSnapshot,
    messageType: 'initial_snapshot' | 'snapshot_update'
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Query all active connections for the game with tenant filtering
      const connections = await this.connectionRepository.getConnectionsByGame(gameId, tenantId);

      if (connections.length === 0) {
        log(LogLevel.INFO, 'No active connections for broadcast', {
          tenant_id: tenantId,
          game_id: gameId,
          message_type: messageType,
          operation: 'broadcastSnapshot',
        });
        return;
      }

      // Send snapshot to each connection
      const sendPromises = connections.map(connection =>
        this.sendSnapshotToConnection(connection.connection_id, snapshot, messageType)
          .catch(async (error) => {
            // Log broadcast failure
            log(LogLevel.WARN, 'Failed to send snapshot to connection', {
              tenant_id: tenantId,
              game_id: gameId,
              connection_id: connection.connection_id,
              error: error instanceof Error ? error.message : 'Unknown error',
              operation: 'broadcastSnapshot',
            });

            // Remove failed connection from store
            try {
              await this.connectionRepository.removeConnection(connection.connection_id);
              log(LogLevel.INFO, 'Removed failed connection', {
                tenant_id: tenantId,
                game_id: gameId,
                connection_id: connection.connection_id,
                operation: 'broadcastSnapshot',
              });
            } catch (removeError) {
              log(LogLevel.ERROR, 'Failed to remove failed connection', {
                tenant_id: tenantId,
                game_id: gameId,
                connection_id: connection.connection_id,
                error: removeError instanceof Error ? removeError.message : 'Unknown error',
                operation: 'broadcastSnapshot',
              });
            }
          })
      );

      // Wait for all sends to complete (including error handling)
      await Promise.all(sendPromises);

      // Log performance
      const duration = Date.now() - startTime;
      log(LogLevel.INFO, 'Broadcast completed', {
        tenant_id: tenantId,
        game_id: gameId,
        message_type: messageType,
        connections_count: connections.length,
        duration_ms: duration,
        operation: 'broadcastSnapshot',
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log(LogLevel.ERROR, 'Broadcast failed', {
        tenant_id: tenantId,
        game_id: gameId,
        message_type: messageType,
        duration_ms: duration,
        operation: 'broadcastSnapshot',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Send snapshot to a specific connection
   * 
   * Constructs a WebSocket message with the snapshot and posts it to the
   * specified connection using the API Gateway Management API.
   * 
   * @param connectionId - WebSocket connection identifier
   * @param snapshot - Game snapshot to send
   * @param messageType - Type of message (initial_snapshot or snapshot_update)
   * @throws Error if posting to connection fails
   * 
   * Requirements: 4.6, 14.1-14.6
   */
  async sendSnapshotToConnection(
    connectionId: string,
    snapshot: GameSnapshot,
    messageType: 'initial_snapshot' | 'snapshot_update'
  ): Promise<void> {
    try {
      // Construct WebSocket message
      const message: WebSocketMessage = {
        message_type: messageType,
        timestamp: new Date().toISOString(),
        data: snapshot,
      };

      // Serialize message to JSON
      const messageData = JSON.stringify(message);

      // Post message to connection using API Gateway Management API
      const client = this.getApiGatewayClient();
      await client.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(messageData, 'utf-8'),
        })
      );

      log(LogLevel.INFO, 'Sent snapshot to connection', {
        connection_id: connectionId,
        message_type: messageType,
        operation: 'sendSnapshotToConnection',
      });
    } catch (error) {
      // Re-throw error for caller to handle (connection cleanup)
      throw new Error(
        `Failed to send snapshot to connection ${connectionId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
