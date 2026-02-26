/**
 * Event Models
 * 
 * Type definitions for game events stored in DynamoDB.
 * Events are immutable and provide an audit trail of all game actions.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

/**
 * Supported event types for game actions
 */
export enum EventType {
  GAME_STARTED = 'GAME_STARTED',
  GOAL_SCORED = 'GOAL_SCORED',
  PENALTY_ASSESSED = 'PENALTY_ASSESSED',
  PERIOD_ENDED = 'PERIOD_ENDED',
  GAME_FINALIZED = 'GAME_FINALIZED',
  GAME_CANCELLED = 'GAME_CANCELLED',
  SCORE_CORRECTED = 'SCORE_CORRECTED',
}

/**
 * Event metadata for audit trail
 */
export interface EventMetadata {
  user_id: string;
  source: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Base event payload interface
 */
export interface EventPayload {
  [key: string]: any;
}

/**
 * Game event structure stored in DynamoDB
 */
export interface GameEvent {
  event_id: string;           // UUID - Primary identifier
  game_id: string;            // Partition key
  tenant_id: string;          // For GSI queries
  event_type: EventType;      // Type of event
  event_version: string;      // Schema version (e.g., "1.0")
  occurred_at: string;        // ISO-8601 timestamp
  sort_key: string;           // occurred_at#event_id for chronological ordering
  payload: EventPayload;      // Event-specific data
  metadata: EventMetadata;    // User, source, IP
  ttl: number;                // Unix timestamp for DynamoDB TTL (90 days)
}

/**
 * Parameters for creating a new event
 */
export interface CreateEventParams {
  game_id: string;
  tenant_id: string;
  event_type: EventType;
  payload: EventPayload;
  metadata: EventMetadata;
}

/**
 * Query parameters for retrieving events
 */
export interface GetEventsParams {
  game_id?: string;
  tenant_id?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
}
