/**
 * Event Validation Module
 * 
 * Validates event payloads against event_type-specific JSON schemas using ajv.
 * Returns 400 Bad Request with field-specific errors for invalid payloads.
 * 
 * Requirements: 6.1, 6.6, 8.6, 10.5
 */

import Ajv, { JSONSchemaType, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { EventType, EventPayload } from '../models/event';
import { BadRequestError } from '../models/errors';

// Initialize ajv with strict mode and format validators
const ajv = new Ajv({ 
  allErrors: true,
  strict: true,
  coerceTypes: false
});

// Add format validators (date-time, uuid, etc.)
addFormats(ajv);

/**
 * GAME_STARTED event payload schema
 */
interface GameStartedPayload {
  start_time: string;
  location?: string;
}

const gameStartedSchema: JSONSchemaType<GameStartedPayload> = {
  type: 'object',
  properties: {
    start_time: { type: 'string', format: 'date-time' },
    location: { type: 'string', nullable: true }
  },
  required: ['start_time'],
  additionalProperties: false
};

/**
 * GOAL_SCORED event payload schema
 */
interface GoalScoredPayload {
  team_id: string;
  player_id: string;
  assist_player_id?: string;
  period: number;
  time_remaining: string;
}

const goalScoredSchema: JSONSchemaType<GoalScoredPayload> = {
  type: 'object',
  properties: {
    team_id: { type: 'string', format: 'uuid' },
    player_id: { type: 'string', format: 'uuid' },
    assist_player_id: { type: 'string', format: 'uuid', nullable: true },
    period: { type: 'number', minimum: 1 },
    time_remaining: { type: 'string', pattern: '^\\d{2}:\\d{2}$' }
  },
  required: ['team_id', 'player_id', 'period', 'time_remaining'],
  additionalProperties: false
};

/**
 * PENALTY_ASSESSED event payload schema
 */
interface PenaltyAssessedPayload {
  team_id: string;
  player_id: string;
  penalty_type: string;
  duration_minutes: number;
  period: number;
  time_remaining: string;
}

const penaltyAssessedSchema: JSONSchemaType<PenaltyAssessedPayload> = {
  type: 'object',
  properties: {
    team_id: { type: 'string', format: 'uuid' },
    player_id: { type: 'string', format: 'uuid' },
    penalty_type: { type: 'string', minLength: 1 },
    duration_minutes: { type: 'number', minimum: 0 },
    period: { type: 'number', minimum: 1 },
    time_remaining: { type: 'string', pattern: '^\\d{2}:\\d{2}$' }
  },
  required: ['team_id', 'player_id', 'penalty_type', 'duration_minutes', 'period', 'time_remaining'],
  additionalProperties: false
};

/**
 * PERIOD_ENDED event payload schema
 */
interface PeriodEndedPayload {
  period: number;
  home_score: number;
  away_score: number;
}

const periodEndedSchema: JSONSchemaType<PeriodEndedPayload> = {
  type: 'object',
  properties: {
    period: { type: 'number', minimum: 1 },
    home_score: { type: 'number', minimum: 0 },
    away_score: { type: 'number', minimum: 0 }
  },
  required: ['period', 'home_score', 'away_score'],
  additionalProperties: false
};

/**
 * GAME_FINALIZED event payload schema
 */
interface GameFinalizedPayload {
  final_home_score: number;
  final_away_score: number;
}

const gameFinalizedSchema: JSONSchemaType<GameFinalizedPayload> = {
  type: 'object',
  properties: {
    final_home_score: { type: 'number', minimum: 0 },
    final_away_score: { type: 'number', minimum: 0 }
  },
  required: ['final_home_score', 'final_away_score'],
  additionalProperties: false
};

/**
 * GAME_CANCELLED event payload schema
 */
interface GameCancelledPayload {
  reason: string;
  cancelled_at: string;
}

const gameCancelledSchema: JSONSchemaType<GameCancelledPayload> = {
  type: 'object',
  properties: {
    reason: { type: 'string', minLength: 1 },
    cancelled_at: { type: 'string', format: 'date-time' }
  },
  required: ['reason', 'cancelled_at'],
  additionalProperties: false
};

/**
 * SCORE_CORRECTED event payload schema
 */
interface ScoreCorrectedPayload {
  team_id: string;
  old_score: number;
  new_score: number;
  reason: string;
}

const scoreCorrectedSchema: JSONSchemaType<ScoreCorrectedPayload> = {
  type: 'object',
  properties: {
    team_id: { type: 'string', format: 'uuid' },
    old_score: { type: 'number', minimum: 0 },
    new_score: { type: 'number', minimum: 0 },
    reason: { type: 'string', minLength: 1 }
  },
  required: ['team_id', 'old_score', 'new_score', 'reason'],
  additionalProperties: false
};

// Compile schemas
const validators = {
  [EventType.GAME_STARTED]: ajv.compile(gameStartedSchema),
  [EventType.GOAL_SCORED]: ajv.compile(goalScoredSchema),
  [EventType.PENALTY_ASSESSED]: ajv.compile(penaltyAssessedSchema),
  [EventType.PERIOD_ENDED]: ajv.compile(periodEndedSchema),
  [EventType.GAME_FINALIZED]: ajv.compile(gameFinalizedSchema),
  [EventType.GAME_CANCELLED]: ajv.compile(gameCancelledSchema),
  [EventType.SCORE_CORRECTED]: ajv.compile(scoreCorrectedSchema)
};

/**
 * Format ajv validation errors into field-specific error details
 */
function formatValidationErrors(errors: ErrorObject[]): any {
  const details: any = {};
  
  for (const error of errors) {
    const field = error.instancePath ? error.instancePath.substring(1) : error.params.missingProperty || 'payload';
    
    let message = error.message || 'Validation failed';
    
    // Enhance error messages based on error type
    if (error.keyword === 'required') {
      message = `Missing required field: ${error.params.missingProperty}`;
    } else if (error.keyword === 'type') {
      message = `Expected ${error.params.type}, received ${typeof error.data}`;
    } else if (error.keyword === 'format') {
      message = `Invalid format, expected ${error.params.format}`;
    } else if (error.keyword === 'pattern') {
      message = `Does not match required pattern`;
    } else if (error.keyword === 'minimum') {
      message = `Must be >= ${error.params.limit}`;
    } else if (error.keyword === 'minLength') {
      message = `Must be at least ${error.params.limit} characters`;
    } else if (error.keyword === 'additionalProperties') {
      message = `Unknown field: ${error.params.additionalProperty}`;
    }
    
    details[field] = message;
  }
  
  return details;
}

/**
 * Validate event payload against event_type-specific schema
 * 
 * @param event_type - The type of event being validated
 * @param payload - The event payload to validate
 * @throws BadRequestError with field-specific details if validation fails
 */
export function validateEventPayload(event_type: EventType, payload: EventPayload): void {
  // Check if validator exists for this event type
  const validator = validators[event_type];
  
  if (!validator) {
    throw new BadRequestError(`Unknown event type: ${event_type}`);
  }
  
  // Validate payload
  const valid = validator(payload);
  
  if (!valid && validator.errors) {
    const details = formatValidationErrors(validator.errors);
    
    // Create error with field-specific details
    const error = new BadRequestError('Invalid event payload');
    (error as any).code = 'INVALID_EVENT_PAYLOAD';
    (error as any).details = details;
    
    throw error;
  }
}

/**
 * Check if an event type is valid
 */
export function isValidEventType(event_type: string): event_type is EventType {
  return Object.values(EventType).includes(event_type as EventType);
}
