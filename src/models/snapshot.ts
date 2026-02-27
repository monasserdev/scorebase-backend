/**
 * Snapshot Models
 * 
 * Type definitions for game snapshots used in real-time synchronization.
 * Snapshots provide a complete representation of current game state for
 * client reconciliation and WebSocket broadcasting.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 10.1-10.8
 */

import { GameEvent } from './event';

/**
 * Complete representation of current game state for client synchronization
 * 
 * Used in:
 * - POST /v1/games/{gameId}/events response (after event creation)
 * - GET /v1/games/{gameId}/snapshot response
 * - WebSocket initial_snapshot and snapshot_update messages
 */
export interface GameSnapshot {
  game_id: string;                          // Game identifier
  home_score: number;                       // Current home team score
  away_score: number;                       // Current away team score
  period: number;                           // Current period number
  clock_seconds: number;                    // Current clock time in seconds
  status: 'scheduled' | 'in_progress' | 'final' | 'postponed';  // Game status
  recent_events: GameEvent[];               // 10 most recent events, ordered by occurred_at desc
  snapshot_version: string;                 // Schema version (e.g., "1.0")
  generated_at: string;                     // ISO-8601 timestamp when snapshot was generated
}
