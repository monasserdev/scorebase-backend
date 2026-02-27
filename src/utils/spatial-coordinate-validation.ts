/**
 * Spatial Coordinate Validation Utility
 * 
 * Validates spatial coordinates for game events to ensure they fall within
 * the normalized 0.0-1.0 range required for resolution-independent positioning.
 * 
 * Requirements: 1.1, 1.2
 */

import { SpatialCoordinates, SpatialCoordinateValidationResult } from '../models/event';

/**
 * Validates spatial coordinates are within the valid 0.0-1.0 range
 * 
 * @param coordinates - The spatial coordinates to validate
 * @returns Validation result with error details if invalid
 * 
 * Requirements:
 * - 1.1: Validate x coordinate is between 0.0 and 1.0 inclusive
 * - 1.2: Validate y coordinate is between 0.0 and 1.0 inclusive
 */
export function validateSpatialCoordinates(
  coordinates: SpatialCoordinates
): SpatialCoordinateValidationResult {
  const errors: { x?: string; y?: string } = {};
  let valid = true;

  // Validate x coordinate (Requirements 1.1)
  if (coordinates.x < 0.0 || coordinates.x > 1.0) {
    errors.x = `x coordinate must be between 0.0 and 1.0, received ${coordinates.x}`;
    valid = false;
  }

  // Validate y coordinate (Requirements 1.2)
  if (coordinates.y < 0.0 || coordinates.y > 1.0) {
    errors.y = `y coordinate must be between 0.0 and 1.0, received ${coordinates.y}`;
    valid = false;
  }

  return {
    valid,
    ...(valid ? {} : { errors })
  };
}
