/**
 * Event Validation Tests
 * 
 * Unit tests for event payload validation against event_type-specific schemas.
 * 
 * Requirements: 6.1, 6.6, 8.6, 10.5
 */

import { validateEventPayload, isValidEventType } from '../../src/utils/event-validation';
import { EventType } from '../../src/models/event';
import { BadRequestError } from '../../src/models/errors';

describe('Event Validation', () => {
  describe('validateEventPayload', () => {
    describe('GAME_STARTED', () => {
      it('should validate valid GAME_STARTED payload', () => {
        const payload = {
          start_time: '2024-01-15T14:00:00.000Z',
          location: 'Arena 1'
        };
        
        expect(() => validateEventPayload(EventType.GAME_STARTED, payload)).not.toThrow();
      });
      
      it('should validate GAME_STARTED payload without optional location', () => {
        const payload = {
          start_time: '2024-01-15T14:00:00.000Z'
        };
        
        expect(() => validateEventPayload(EventType.GAME_STARTED, payload)).not.toThrow();
      });
      
      it('should reject GAME_STARTED payload missing start_time', () => {
        const payload = {
          location: 'Arena 1'
        };
        
        expect(() => validateEventPayload(EventType.GAME_STARTED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject GAME_STARTED payload with invalid start_time format', () => {
        const payload = {
          start_time: 'invalid-date'
        };
        
        expect(() => validateEventPayload(EventType.GAME_STARTED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject GAME_STARTED payload with additional properties', () => {
        const payload = {
          start_time: '2024-01-15T14:00:00.000Z',
          extra_field: 'not allowed'
        };
        
        expect(() => validateEventPayload(EventType.GAME_STARTED, payload)).toThrow(BadRequestError);
      });
    });
    
    describe('GOAL_SCORED', () => {
      it('should validate valid GOAL_SCORED payload', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          player_id: '223e4567-e89b-12d3-a456-426614174000',
          assist_player_id: '323e4567-e89b-12d3-a456-426614174000',
          period: 2,
          time_remaining: '08:45'
        };
        
        expect(() => validateEventPayload(EventType.GOAL_SCORED, payload)).not.toThrow();
      });
      
      it('should validate GOAL_SCORED payload without optional assist_player_id', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          player_id: '223e4567-e89b-12d3-a456-426614174000',
          period: 2,
          time_remaining: '08:45'
        };
        
        expect(() => validateEventPayload(EventType.GOAL_SCORED, payload)).not.toThrow();
      });
      
      it('should reject GOAL_SCORED payload missing required fields', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000'
        };
        
        expect(() => validateEventPayload(EventType.GOAL_SCORED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject GOAL_SCORED payload with invalid UUID format', () => {
        const payload = {
          team_id: 'invalid-uuid',
          player_id: '223e4567-e89b-12d3-a456-426614174000',
          period: 2,
          time_remaining: '08:45'
        };
        
        expect(() => validateEventPayload(EventType.GOAL_SCORED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject GOAL_SCORED payload with invalid period (< 1)', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          player_id: '223e4567-e89b-12d3-a456-426614174000',
          period: 0,
          time_remaining: '08:45'
        };
        
        expect(() => validateEventPayload(EventType.GOAL_SCORED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject GOAL_SCORED payload with invalid time_remaining format', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          player_id: '223e4567-e89b-12d3-a456-426614174000',
          period: 2,
          time_remaining: '8:45' // Should be 08:45
        };
        
        expect(() => validateEventPayload(EventType.GOAL_SCORED, payload)).toThrow(BadRequestError);
      });
    });
    
    describe('PENALTY_ASSESSED', () => {
      it('should validate valid PENALTY_ASSESSED payload', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          player_id: '223e4567-e89b-12d3-a456-426614174000',
          penalty_type: 'Tripping',
          duration_minutes: 2,
          period: 3,
          time_remaining: '12:30'
        };
        
        expect(() => validateEventPayload(EventType.PENALTY_ASSESSED, payload)).not.toThrow();
      });
      
      it('should reject PENALTY_ASSESSED payload missing required fields', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          player_id: '223e4567-e89b-12d3-a456-426614174000'
        };
        
        expect(() => validateEventPayload(EventType.PENALTY_ASSESSED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject PENALTY_ASSESSED payload with negative duration', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          player_id: '223e4567-e89b-12d3-a456-426614174000',
          penalty_type: 'Tripping',
          duration_minutes: -1,
          period: 3,
          time_remaining: '12:30'
        };
        
        expect(() => validateEventPayload(EventType.PENALTY_ASSESSED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject PENALTY_ASSESSED payload with empty penalty_type', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          player_id: '223e4567-e89b-12d3-a456-426614174000',
          penalty_type: '',
          duration_minutes: 2,
          period: 3,
          time_remaining: '12:30'
        };
        
        expect(() => validateEventPayload(EventType.PENALTY_ASSESSED, payload)).toThrow(BadRequestError);
      });
    });
    
    describe('PERIOD_ENDED', () => {
      it('should validate valid PERIOD_ENDED payload', () => {
        const payload = {
          period: 1,
          home_score: 2,
          away_score: 1
        };
        
        expect(() => validateEventPayload(EventType.PERIOD_ENDED, payload)).not.toThrow();
      });
      
      it('should validate PERIOD_ENDED payload with zero scores', () => {
        const payload = {
          period: 1,
          home_score: 0,
          away_score: 0
        };
        
        expect(() => validateEventPayload(EventType.PERIOD_ENDED, payload)).not.toThrow();
      });
      
      it('should reject PERIOD_ENDED payload missing required fields', () => {
        const payload = {
          period: 1
        };
        
        expect(() => validateEventPayload(EventType.PERIOD_ENDED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject PERIOD_ENDED payload with negative scores', () => {
        const payload = {
          period: 1,
          home_score: -1,
          away_score: 1
        };
        
        expect(() => validateEventPayload(EventType.PERIOD_ENDED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject PERIOD_ENDED payload with invalid period (< 1)', () => {
        const payload = {
          period: 0,
          home_score: 2,
          away_score: 1
        };
        
        expect(() => validateEventPayload(EventType.PERIOD_ENDED, payload)).toThrow(BadRequestError);
      });
    });
    
    describe('GAME_FINALIZED', () => {
      it('should validate valid GAME_FINALIZED payload', () => {
        const payload = {
          final_home_score: 5,
          final_away_score: 3
        };
        
        expect(() => validateEventPayload(EventType.GAME_FINALIZED, payload)).not.toThrow();
      });
      
      it('should validate GAME_FINALIZED payload with zero scores', () => {
        const payload = {
          final_home_score: 0,
          final_away_score: 0
        };
        
        expect(() => validateEventPayload(EventType.GAME_FINALIZED, payload)).not.toThrow();
      });
      
      it('should reject GAME_FINALIZED payload missing required fields', () => {
        const payload = {
          final_home_score: 5
        };
        
        expect(() => validateEventPayload(EventType.GAME_FINALIZED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject GAME_FINALIZED payload with negative scores', () => {
        const payload = {
          final_home_score: -1,
          final_away_score: 3
        };
        
        expect(() => validateEventPayload(EventType.GAME_FINALIZED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject GAME_FINALIZED payload with additional properties', () => {
        const payload = {
          final_home_score: 5,
          final_away_score: 3,
          extra_field: 'not allowed'
        };
        
        expect(() => validateEventPayload(EventType.GAME_FINALIZED, payload)).toThrow(BadRequestError);
      });
    });
    
    describe('GAME_CANCELLED', () => {
      it('should validate valid GAME_CANCELLED payload', () => {
        const payload = {
          reason: 'Weather conditions',
          cancelled_at: '2024-01-15T14:00:00.000Z'
        };
        
        expect(() => validateEventPayload(EventType.GAME_CANCELLED, payload)).not.toThrow();
      });
      
      it('should reject GAME_CANCELLED payload missing required fields', () => {
        const payload = {
          reason: 'Weather conditions'
        };
        
        expect(() => validateEventPayload(EventType.GAME_CANCELLED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject GAME_CANCELLED payload with empty reason', () => {
        const payload = {
          reason: '',
          cancelled_at: '2024-01-15T14:00:00.000Z'
        };
        
        expect(() => validateEventPayload(EventType.GAME_CANCELLED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject GAME_CANCELLED payload with invalid cancelled_at format', () => {
        const payload = {
          reason: 'Weather conditions',
          cancelled_at: 'invalid-date'
        };
        
        expect(() => validateEventPayload(EventType.GAME_CANCELLED, payload)).toThrow(BadRequestError);
      });
    });
    
    describe('SCORE_CORRECTED', () => {
      it('should validate valid SCORE_CORRECTED payload', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          old_score: 3,
          new_score: 4,
          reason: 'Scoring error corrected'
        };
        
        expect(() => validateEventPayload(EventType.SCORE_CORRECTED, payload)).not.toThrow();
      });
      
      it('should reject SCORE_CORRECTED payload missing required fields', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          old_score: 3
        };
        
        expect(() => validateEventPayload(EventType.SCORE_CORRECTED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject SCORE_CORRECTED payload with invalid UUID', () => {
        const payload = {
          team_id: 'invalid-uuid',
          old_score: 3,
          new_score: 4,
          reason: 'Scoring error corrected'
        };
        
        expect(() => validateEventPayload(EventType.SCORE_CORRECTED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject SCORE_CORRECTED payload with negative scores', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          old_score: -1,
          new_score: 4,
          reason: 'Scoring error corrected'
        };
        
        expect(() => validateEventPayload(EventType.SCORE_CORRECTED, payload)).toThrow(BadRequestError);
      });
      
      it('should reject SCORE_CORRECTED payload with empty reason', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000',
          old_score: 3,
          new_score: 4,
          reason: ''
        };
        
        expect(() => validateEventPayload(EventType.SCORE_CORRECTED, payload)).toThrow(BadRequestError);
      });
    });
    
    describe('Error handling', () => {
      it('should throw BadRequestError for unknown event type', () => {
        const payload = { some: 'data' };
        
        expect(() => validateEventPayload('UNKNOWN_EVENT' as EventType, payload)).toThrow(BadRequestError);
        expect(() => validateEventPayload('UNKNOWN_EVENT' as EventType, payload)).toThrow('Unknown event type');
      });
      
      it('should include INVALID_EVENT_PAYLOAD error code', () => {
        const payload = {
          team_id: '123e4567-e89b-12d3-a456-426614174000'
          // Missing required fields
        };
        
        try {
          validateEventPayload(EventType.GOAL_SCORED, payload);
          fail('Should have thrown BadRequestError');
        } catch (error: any) {
          expect(error).toBeInstanceOf(BadRequestError);
          expect(error.code).toBe('INVALID_EVENT_PAYLOAD');
          expect(error.details).toBeDefined();
        }
      });
      
      it('should include field-specific error details', () => {
        const payload = {
          team_id: 'invalid-uuid',
          player_id: '223e4567-e89b-12d3-a456-426614174000',
          period: 0, // Invalid: must be >= 1
          time_remaining: '8:45' // Invalid format
        };
        
        try {
          validateEventPayload(EventType.GOAL_SCORED, payload);
          fail('Should have thrown BadRequestError');
        } catch (error: any) {
          expect(error).toBeInstanceOf(BadRequestError);
          expect(error.details).toBeDefined();
          expect(Object.keys(error.details).length).toBeGreaterThan(0);
        }
      });
    });
  });
  
  describe('isValidEventType', () => {
    it('should return true for valid event types', () => {
      expect(isValidEventType('GAME_STARTED')).toBe(true);
      expect(isValidEventType('GOAL_SCORED')).toBe(true);
      expect(isValidEventType('PENALTY_ASSESSED')).toBe(true);
      expect(isValidEventType('PERIOD_ENDED')).toBe(true);
      expect(isValidEventType('GAME_FINALIZED')).toBe(true);
      expect(isValidEventType('GAME_CANCELLED')).toBe(true);
      expect(isValidEventType('SCORE_CORRECTED')).toBe(true);
    });
    
    it('should return false for invalid event types', () => {
      expect(isValidEventType('UNKNOWN_EVENT')).toBe(false);
      expect(isValidEventType('invalid')).toBe(false);
      expect(isValidEventType('')).toBe(false);
    });
  });
});
