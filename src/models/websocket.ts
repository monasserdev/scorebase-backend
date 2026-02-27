/**
 * WebSocket Connection Models
 * 
 * Type definitions for WebSocket connection metadata used in real-time
 * game synchronization. Connections are stored in DynamoDB for tracking
 * active clients and enabling broadcast distribution.
 * 
 * Requirements: 4.1, 11.1
 */

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
