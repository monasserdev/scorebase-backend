/**
 * Unit tests for database connection pool module
 * 
 * Tests connection pooling, query execution, transaction handling,
 * and error scenarios.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import {
  getPool,
  query,
  transaction,
  closePool,
  isPoolHealthy,
  resetPool,
} from '../../src/config/database';

// Mock pg module
jest.mock('pg', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  };
  
  return {
    Pool: jest.fn(() => mockPool),
  };
});

describe('Database Connection Pool', () => {
  let mockPool: any;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Set required environment variables
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'test_db';
    process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';
    process.env.DYNAMODB_TABLE_NAME = 'test-events';
    process.env.S3_ARCHIVE_BUCKET = 'test-bucket';
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_test';
    
    // Get mock pool instance
    mockPool = new Pool();
  });

  afterEach(async () => {
    // Clean up pool after each test
    await closePool();
    // Reset the Pool constructor mock
    (Pool as jest.MockedClass<typeof Pool>).mockClear();
  });

  describe('getPool', () => {
    it('should create a new pool with correct configuration', () => {
      const pool = getPool();
      
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'test_db',
          min: 5,
          max: 20,
          user: 'test_user',
          password: 'test_password',
        })
      );
      
      expect(pool).toBeDefined();
    });

    it('should reuse existing pool on subsequent calls', () => {
      // Reset pool to ensure clean state
      resetPool();
      (Pool as jest.MockedClass<typeof Pool>).mockClear();
      
      const pool1 = getPool();
      const pool2 = getPool();
      
      expect(pool1).toBe(pool2);
      expect(Pool).toHaveBeenCalledTimes(1);
    });

    it('should register error handler on pool', () => {
      getPool();
      
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('query', () => {
    it('should execute parameterized query successfully', async () => {
      const mockResult: QueryResult = {
        rows: [{ id: 1, name: 'Test League' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      };
      
      mockPool.query.mockResolvedValue(mockResult);
      
      const result = await query(
        'SELECT * FROM leagues WHERE tenant_id = $1',
        ['tenant-123']
      );
      
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM leagues WHERE tenant_id = $1',
        ['tenant-123']
      );
      expect(result.rows).toEqual([{ id: 1, name: 'Test League' }]);
    });

    it('should execute query without parameters', async () => {
      const mockResult: QueryResult = {
        rows: [{ count: 5 }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      };
      
      mockPool.query.mockResolvedValue(mockResult);
      
      const result = await query('SELECT COUNT(*) as count FROM leagues');
      
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM leagues',
        undefined
      );
      expect(result.rows[0].count).toBe(5);
    });

    it('should handle query errors', async () => {
      const error = new Error('Connection timeout');
      mockPool.query.mockRejectedValue(error);
      
      await expect(
        query('SELECT * FROM leagues')
      ).rejects.toThrow('Connection timeout');
    });
  });

  describe('transaction', () => {
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      
      mockPool.connect.mockResolvedValue(mockClient);
    });

    it('should execute callback within transaction and commit', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      
      const callback = jest.fn(async (client: PoolClient) => {
        await client.query('INSERT INTO leagues VALUES ($1)', ['league-1']);
        return { success: true };
      });
      
      const result = await transaction(callback);
      
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should rollback transaction on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Constraint violation')) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      
      const callback = jest.fn(async (client: PoolClient) => {
        await client.query('INSERT INTO leagues VALUES ($1)', ['league-1']);
      });
      
      await expect(transaction(callback)).rejects.toThrow('Constraint violation');
      
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even if rollback fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Insert failed')) // INSERT
        .mockRejectedValueOnce(new Error('Rollback failed')); // ROLLBACK
      
      const callback = jest.fn(async (client: PoolClient) => {
        await client.query('INSERT INTO leagues VALUES ($1)', ['league-1']);
      });
      
      await expect(transaction(callback)).rejects.toThrow('Rollback failed');
      
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should support nested operations in transaction', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      
      const callback = async (client: PoolClient) => {
        await client.query('INSERT INTO leagues VALUES ($1)', ['league-1']);
        await client.query('INSERT INTO teams VALUES ($1)', ['team-1']);
        await client.query('INSERT INTO players VALUES ($1)', ['player-1']);
        return { inserted: 3 };
      };
      
      const result = await transaction(callback);
      
      expect(mockClient.query).toHaveBeenCalledTimes(5); // BEGIN + 3 inserts + COMMIT
      expect(result).toEqual({ inserted: 3 });
    });
  });

  describe('closePool', () => {
    it('should close existing pool', async () => {
      getPool(); // Create pool
      
      await closePool();
      
      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle closing when no pool exists', async () => {
      await expect(closePool()).resolves.not.toThrow();
    });

    it('should allow creating new pool after closing', async () => {
      getPool();
      await closePool();
      
      jest.clearAllMocks();
      
      const newPool = getPool();
      
      expect(Pool).toHaveBeenCalledTimes(1);
      expect(newPool).toBeDefined();
    });
  });

  describe('isPoolHealthy', () => {
    it('should return true when health check succeeds', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ health_check: 1 }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });
      
      const healthy = await isPoolHealthy();
      
      expect(healthy).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1 as health_check', undefined);
    });

    it('should return false when health check fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));
      
      const healthy = await isPoolHealthy();
      
      expect(healthy).toBe(false);
    });

    it('should return false when health check returns unexpected result', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });
      
      const healthy = await isPoolHealthy();
      
      expect(healthy).toBe(false);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should use parameterized queries to prevent SQL injection', async () => {
      const maliciousInput = "'; DROP TABLE leagues; --";
      
      mockPool.query.mockResolvedValue({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });
      
      await query(
        'SELECT * FROM leagues WHERE name = $1',
        [maliciousInput]
      );
      
      // Verify the malicious input is passed as a parameter, not concatenated
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM leagues WHERE name = $1',
        [maliciousInput]
      );
    });
  });
});
