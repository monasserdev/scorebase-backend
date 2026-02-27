/**
 * WebSocket Connection Models
 * 
 * Type definitions for WebSocket connection metadata used in real-time
 * game synchronization. Connections are stored in DynamoDB for tracking
 * active clients and enabling broadcast distribution.
 * 
 * Requirements: 4.1, 11.1, 14.1-14.6
 */

import { GameSnapshot } from './snapshot';

/**
 * WebSocket connection metadata stored in DynamoDB
 * 
 * Used for:
 * - Tracking active WebSocket connections per game
 * - Enabling broadcast distribution to connected clients
 * - Multi-tenant isolation of real-time updates
 * - Automatic cleanup of stale connections via TTL
 * 
 * DynamoDB Schema:
 * - Table: scorebase-websocket-connections
 * - Partition Key: connection_id (string)
 * - GSI: game-connections-index
 *   - Partition Key: game_id (string)
 *   - Sort Key: connected_at (string)
 * - TTL Attribute: ttl (24 hours from connection)
 */
export interface WebSocketConnection {
  connection_id: string;        // API Gateway connection ID (partition key)
  game_id: string;              // Game being watched (GSI partition key)
  tenant_id: string;            // Tenant identifier for isolation
  user_id: string;              // User identifier from JWT
  connected_at: string;         // ISO-8601 timestamp
  ttl: number;                  // Unix timestamp for DynamoDB TTL (24 hours)
}

/**
 * WebSocket message format for real-time communication
 * 
 * Used for:
 * - Sending initial game snapshots on connection
 * - Broadcasting game state updates to connected clients
 * - Keepalive ping/pong messages
 * 
 * Message Types:
 * - initial_snapshot: Sent when client first connects
 * - snapshot_update: Broadcast when game events occur
 * - ping: Server keepalive message (every 30 seconds)
 * - pong: Client response to ping
 * 
 * Requirements: 14.1-14.6
 */
export interface WebSocketMessage {
  message_type: 'initial_snapshot' | 'snapshot_update' | 'ping' | 'pong';
  timestamp: string;            // ISO-8601 timestamp
  data?: GameSnapshot;          // Present for snapshot messages (initial_snapshot, snapshot_update)
  request_id?: string;          // Optional request correlation ID
}

