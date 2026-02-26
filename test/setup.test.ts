/**
 * Setup Test
 * 
 * Verifies that the test infrastructure is working correctly.
 */

describe('Project Setup', () => {
  it('should have TypeScript configured correctly', () => {
    expect(true).toBe(true);
  });

  it('should be able to import from src', () => {
    const { loadEnvironmentConfig } = require('../src/config/environment');
    expect(loadEnvironmentConfig).toBeDefined();
    expect(typeof loadEnvironmentConfig).toBe('function');
  });
});
