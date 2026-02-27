/**
 * Event Models
 * 
 * Type definitions for game events stored in DynamoDB.
 * Events are immutable and provide an audit trail of all game actions.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 1.1, 1.2, 1.4
 */

/**
 * Normalized spatial coordinates for event location on playing surface
 * 
 * Coordinates use a normalized 0.0-1.0 range to be resolution-independent:
 * - x: 0.0 (left edge) to 1.0 (right edge)
 * - y: 0.0 (top edge) to 1.0 (bottom edge)
 * - zone: Optional semantic zone identifier
 * 
 * Stored with 4 decimal place precision for analytics.
 * 
 * Requirements: 1.1, 1.2, 1.4, 12.1, 12.2, 12.3
 */
export interface SpatialCoordinates {
  /**
   * Horizontal position (0.0 = left, 1.0 = right)
   * Must be between 0.0 and 1.0 inclusive
   */
  x: number;
  
  /**
   * Vertical position (0.0 = top, 1.0 = bottom)
   * Must be between 0.0 and 1.0 inclusive
   */
  y: number;
  
  /**
   * Optional zone identifier (e.g., "offensive", "defensive", "neutral")
   */
  zone?: string;
}

/**
 * Validation result for spatial coordinates
 */
export interface SpatialCoordinateValidationResult {
  valid: boolean;
  errors?: {
    x?: string;
    y?: string;
  };
}

/**
 * Supported event types for game actions
 */
export enum EventType {
  GAME_STARTED = 'GAME_STARTED',
  GOAL_SCORED = 'GOAL_SCORED',
  PENALTY_ASSESSED = 'PENALTY_ASSESSED',
  SHOT_ON_GOAL = 'SHOT_ON_GOAL',
  PERIOD_ENDED = 'PERIOD_ENDED',
  GAME_FINALIZED = 'GAME_FINALIZED',
  GAME_CANCELLED = 'GAME_CANCELLED',
  SCORE_CORRECTED = 'SCORE_CORRECTED',
  EVENT_REVERSAL = 'EVENT_REVERSAL',
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
 * Payload for EVENT_REVERSAL event type
 * 
 * Used to undo the effects of a previously recorded event.
 * The reversal creates a new immutable event that references the original event.
 * 
 * Requirements: 6.2
 */
export interface EventReversalPayload extends EventPayload {
  /**
   * UUID of the event being reversed
   * Must reference an existing event in the Event_Store
   */
  reversed_event_id: string;
  
  /**
   * Optional reason for the reversal
   * Useful for audit trail and understanding why the event was reversed
   */
  reason?: string;
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
  occurred_at: string;        // ISO-8601 timestamp (may be client-provided for offline events)
  sort_key: string;           // occurred_at#event_id for chronological ordering
  payload: EventPayload;      // Event-specific data
  metadata: EventMetadata;    // User, source, IP
  ttl: number;                // Unix timestamp for DynamoDB TTL (90 days)
  idempotency_key?: string;   // Optional idempotency key for duplicate prevention
  reversed_by?: string;       // Event ID that reversed this event
  spatial_coordinates?: SpatialCoordinates; // Optional location data for event
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
