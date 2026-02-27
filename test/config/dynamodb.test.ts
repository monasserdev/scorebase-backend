/**
 * DynamoDB Client Module Tests
 * 
 * Unit tests for DynamoDB event operations.
 * Tests event creation, retrieval, and TTL calculation.
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  writeEvent,
  getEventsByGame,
  getEventsByTenant,
  getDynamoDBClient,
  resetDynamoDBClient,
  WEBSOCKET_CONNECTIONS_TABLE,
  GAME_CONNECTIONS_INDEX,
} from '../../src/config/dynamodb';
import { EventType } from '../../src/models/event';

// Create mock for DynamoDB DocumentClient
const ddbMock = mockClient(DynamoDBDocumentClient);

// Mock environment config
jest.mock('../../src/config/environment', () => ({
  loadEnvironmentConfig: jest.fn().mockReturnValue({
    dynamodbTableName: 'test-events-table',
  }),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-event-id-123'),
}));

describe('DynamoDB Client Module', () => {
  beforeEach(() => {
    ddbMock.reset();
    jest.clearAllMocks();
    resetDynamoDBClient();
    // Mock Date for consistent timestamps
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Constants', () => {
    it('should export WEBSOCKET_CONNECTIONS_TABLE constant', () => {
      expect(WEBSOCKET_CONNECTIONS_TABLE).toBe('scorebase-websocket-connections');
    });

    it('should export GAME_CONNECTIONS_INDEX constant', () => {
      expect(GAME_CONNECTIONS_INDEX).toBe('game-connections-index');
    });
  });

  describe('getDynamoDBClient', () => {
    it('should create and return a DynamoDB DocumentClient', () => {
      const client = getDynamoDBClient();
      expect(client).toBeDefined();
    });

    it('should reuse the same client instance across calls', () => {
      const client1 = getDynamoDBClient();
      const client2 = getDynamoDBClient();
      expect(client1).toBe(client2);
    });
  });

  describe('writeEvent', () => {
    it('should write event to DynamoDB with correct structure', async () => {
      ddbMock.on(PutCommand).resolves({});

      const params = {
        game_id: 'game-123',
        tenant_id: 'tenant-456',
        event_type: EventType.GOAL_SCORED,
        payload: {
          team_id: 'team-789',
          player_id: 'player-101',
          period: 1,
          time: '12:34',
        },
        metadata: {
          user_id: 'user-202',
          source: 'mobile-app',
          ip_address: '192.168.1.1',
        },
      };

      const event = await writeEvent(params);

      // Verify event structure
      expect(event.event_id).toBe('test-event-id-123');
      expect(event.game_id).toBe('game-123');
      expect(event.tenant_id).toBe('tenant-456');
      expect(event.event_type).toBe(EventType.GOAL_SCORED);
      expect(event.event_version).toBe('1.0');
      expect(event.occurred_at).toBe('2024-01-15T10:30:00.000Z');
      expect(event.sort_key).toBe('2024-01-15T10:30:00.000Z#test-event-id-123');
      expect(event.payload).toEqual(params.payload);
      expect(event.metadata).toEqual(params.metadata);
      expect(event.ttl).toBeGreaterThan(0);

      // Verify DynamoDB PutCommand was called
      expect(ddbMock.commandCalls(PutCommand).length).toBe(1);
      expect(ddbMock.commandCalls(PutCommand)[0].args[0].input).toEqual({
        TableName: 'test-events-table',
        Item: event,
      });
    });

    it('should calculate TTL as 90 days from now', async () => {
      ddbMock.on(PutCommand).resolves({});

      const now = new Date('2024-01-15T10:30:00.000Z');
      const expectedTTL = Math.floor(
        new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).getTime() / 1000
      );

      const params = {
        game_id: 'game-123',
        tenant_id: 'tenant-456',
        event_type: EventType.GAME_STARTED,
        payload: {},
        metadata: {
          user_id: 'user-202',
          source: 'web-app',
        },
      };

      const event = await writeEvent(params);

      // TTL should be approximately 90 days from now (allow 1 second tolerance)
      expect(Math.abs(event.ttl - expectedTTL)).toBeLessThanOrEqual(1);
    });

    it('should create sort key with occurred_at and event_id', async () => {
      ddbMock.on(PutCommand).resolves({});

      const params = {
        game_id: 'game-123',
        tenant_id: 'tenant-456',
        event_type: EventType.PERIOD_ENDED,
        payload: { period: 1 },
        metadata: {
          user_id: 'user-202',
          source: 'api',
        },
      };

      const event = await writeEvent(params);

      expect(event.sort_key).toBe('2024-01-15T10:30:00.000Z#test-event-id-123');
    });
  });

  describe('getEventsByGame', () => {
    it('should query events by game_id with tenant validation', async () => {
      const mockEvents = [
        {
          event_id: 'event-1',
          game_id: 'game-123',
          tenant_id: 'tenant-456',
          event_type: EventType.GAME_STARTED,
          occurred_at: '2024-01-15T10:00:00.000Z',
          sort_key: '2024-01-15T10:00:00.000Z#event-1',
        },
        {
          event_id: 'event-2',
          game_id: 'game-123',
          tenant_id: 'tenant-456',
          event_type: EventType.GOAL_SCORED,
          occurred_at: '2024-01-15T10:15:00.000Z',
          sort_key: '2024-01-15T10:15:00.000Z#event-2',
        },
      ];

      ddbMock.on(QueryCommand).resolves({ Items: mockEvents });

      const events = await getEventsByGame('game-123', 'tenant-456');

      expect(events).toEqual(mockEvents);
      expect(ddbMock.commandCalls(QueryCommand).length).toBe(1);
      expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input).toEqual({
        TableName: 'test-events-table',
        KeyConditionExpression: 'game_id = :game_id',
        FilterExpression: 'tenant_id = :tenant_id',
        ExpressionAttributeValues: {
          ':game_id': 'game-123',
          ':tenant_id': 'tenant-456',
        },
        ScanIndexForward: true,
      });
    });

    it('should return events in chronological order', async () => {
      const mockEvents = [
        {
          event_id: 'event-1',
          occurred_at: '2024-01-15T10:00:00.000Z',
          sort_key: '2024-01-15T10:00:00.000Z#event-1',
        },
        {
          event_id: 'event-2',
          occurred_at: '2024-01-15T10:15:00.000Z',
          sort_key: '2024-01-15T10:15:00.000Z#event-2',
        },
      ];

      ddbMock.on(QueryCommand).resolves({ Items: mockEvents });

      const events = await getEventsByGame('game-123', 'tenant-456');

      expect(events[0].occurred_at).toBe('2024-01-15T10:00:00.000Z');
      expect(events[1].occurred_at).toBe('2024-01-15T10:15:00.000Z');
    });

    it('should return empty array when no events found', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: undefined });

      const events = await getEventsByGame('game-123', 'tenant-456');

      expect(events).toEqual([]);
    });
  });

  describe('getEventsByTenant', () => {
    it('should query events by tenant_id using GSI', async () => {
      const mockEvents = [
        {
          event_id: 'event-1',
          game_id: 'game-123',
          tenant_id: 'tenant-456',
          event_type: EventType.GOAL_SCORED,
        },
      ];

      ddbMock.on(QueryCommand).resolves({ Items: mockEvents });

      const events = await getEventsByTenant({ tenant_id: 'tenant-456' });

      expect(events).toEqual(mockEvents);
      expect(ddbMock.commandCalls(QueryCommand).length).toBe(1);
      expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input).toEqual({
        TableName: 'test-events-table',
        IndexName: 'tenant-events-index',
        KeyConditionExpression: 'tenant_id = :tenant_id',
        ExpressionAttributeValues: {
          ':tenant_id': 'tenant-456',
        },
        ScanIndexForward: true,
      });
    });

    it('should throw error when tenant_id is missing', async () => {
      await expect(getEventsByTenant({})).rejects.toThrow(
        'tenant_id is required for getEventsByTenant'
      );
    });

    it('should support date range filtering', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await getEventsByTenant({
        tenant_id: 'tenant-456',
        start_date: '2024-01-01T00:00:00.000Z',
        end_date: '2024-01-31T23:59:59.999Z',
      });

      expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input).toEqual({
        TableName: 'test-events-table',
        IndexName: 'tenant-events-index',
        KeyConditionExpression:
          'tenant_id = :tenant_id AND sort_key BETWEEN :start_key AND :end_key',
        ExpressionAttributeValues: {
          ':tenant_id': 'tenant-456',
          ':start_key': '2024-01-01T00:00:00.000Z#',
          ':end_key': '2024-01-31T23:59:59.999Z#\uffff',
        },
        ScanIndexForward: true,
      });
    });

    it('should support start_date only filtering', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await getEventsByTenant({
        tenant_id: 'tenant-456',
        start_date: '2024-01-01T00:00:00.000Z',
      });

      expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input).toEqual({
        TableName: 'test-events-table',
        IndexName: 'tenant-events-index',
        KeyConditionExpression: 'tenant_id = :tenant_id AND sort_key >= :start_key',
        ExpressionAttributeValues: {
          ':tenant_id': 'tenant-456',
          ':start_key': '2024-01-01T00:00:00.000Z#',
        },
        ScanIndexForward: true,
      });
    });

    it('should support end_date only filtering', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await getEventsByTenant({
        tenant_id: 'tenant-456',
        end_date: '2024-01-31T23:59:59.999Z',
      });

      expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input).toEqual({
        TableName: 'test-events-table',
        IndexName: 'tenant-events-index',
        KeyConditionExpression: 'tenant_id = :tenant_id AND sort_key <= :end_key',
        ExpressionAttributeValues: {
          ':tenant_id': 'tenant-456',
          ':end_key': '2024-01-31T23:59:59.999Z#\uffff',
        },
        ScanIndexForward: true,
      });
    });

    it('should support limit parameter', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await getEventsByTenant({
        tenant_id: 'tenant-456',
        limit: 50,
      });

      expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input).toEqual({
        TableName: 'test-events-table',
        IndexName: 'tenant-events-index',
        KeyConditionExpression: 'tenant_id = :tenant_id',
        ExpressionAttributeValues: {
          ':tenant_id': 'tenant-456',
        },
        ScanIndexForward: true,
        Limit: 50,
      });
    });
  });
});
