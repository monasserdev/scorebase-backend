/**
 * ScoreBase Backend API
 * 
 * Main entry point for the Lambda function.
 * This file will be implemented in later tasks.
 */

export * from './config/environment';

// Placeholder for Lambda handler
// Will be implemented in task 9.1
export async function handler(_event: unknown): Promise<unknown> {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'ScoreBase Backend API - Coming Soon',
    }),
  };
}
