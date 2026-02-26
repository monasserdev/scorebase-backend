/**
 * Tests for CloudWatch Metrics Utilities
 * 
 * Tests metric emission functions for standings calculation,
 * event writes, and security violations.
 */

import { mockClient } from 'aws-sdk-client-mock';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import {
  emitMetric,
  emitStandingsCalculationDuration,
  emitEventWriteLatency,
  emitCrossTenantAccessAttempt,
  measureDuration,
  MetricName,
  MetricUnit,
} from '../../src/utils/metrics';

// Create CloudWatch mock
const cloudWatchMock = mockClient(CloudWatchClient);

describe('CloudWatch Metrics Utilities', () => {
  beforeEach(() => {
    cloudWatchMock.reset();
  });

  describe('emitMetric', () => {
    it('should emit metric with correct parameters', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await emitMetric(
        MetricName.STANDINGS_CALCULATION_DURATION,
        150,
        MetricUnit.MILLISECONDS,
        {
          tenant_id: 'tenant-123',
          season_id: 'season-456',
        }
      );

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(calls.length).toBe(1);

      const command = calls[0].args[0].input;
      expect(command.Namespace).toBe('ScoreBase/Backend');
      expect(command.MetricData).toHaveLength(1);
      expect(command.MetricData![0].MetricName).toBe('StandingsCalculationDuration');
      expect(command.MetricData![0].Value).toBe(150);
      expect(command.MetricData![0].Unit).toBe('Milliseconds');
      expect(command.MetricData![0].Dimensions).toEqual([
        { Name: 'tenant_id', Value: 'tenant-123' },
        { Name: 'season_id', Value: 'season-456' },
      ]);
    });

    it('should emit metric without dimensions', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await emitMetric(
        MetricName.CROSS_TENANT_ACCESS_ATTEMPT,
        1,
        MetricUnit.COUNT
      );

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(calls.length).toBe(1);

      const command = calls[0].args[0].input;
      expect(command.MetricData![0].Dimensions).toBeUndefined();
    });

    it('should filter out undefined dimension values', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await emitMetric(
        MetricName.EVENT_WRITE_LATENCY,
        50,
        MetricUnit.MILLISECONDS,
        {
          tenant_id: 'tenant-123',
          event_type: undefined,
        }
      );

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const command = calls[0].args[0].input;
      
      expect(command.MetricData![0].Dimensions).toEqual([
        { Name: 'tenant_id', Value: 'tenant-123' },
      ]);
    });

    it('should not throw error if CloudWatch API fails', async () => {
      cloudWatchMock.on(PutMetricDataCommand).rejects(new Error('CloudWatch API error'));

      // Should not throw
      await expect(
        emitMetric(MetricName.STANDINGS_CALCULATION_DURATION, 100, MetricUnit.MILLISECONDS)
      ).resolves.toBeUndefined();
    });
  });

  describe('emitStandingsCalculationDuration', () => {
    it('should emit standings calculation duration metric', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await emitStandingsCalculationDuration('tenant-123', 'season-456', 250);

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(calls.length).toBe(1);

      const command = calls[0].args[0].input;
      expect(command.MetricData![0].MetricName).toBe('StandingsCalculationDuration');
      expect(command.MetricData![0].Value).toBe(250);
      expect(command.MetricData![0].Unit).toBe('Milliseconds');
      expect(command.MetricData![0].Dimensions).toEqual([
        { Name: 'tenant_id', Value: 'tenant-123' },
        { Name: 'season_id', Value: 'season-456' },
        { Name: 'operation_type', Value: 'standings_calculation' },
      ]);
    });
  });

  describe('emitEventWriteLatency', () => {
    it('should emit event write latency metric', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await emitEventWriteLatency('tenant-123', 'GOAL_SCORED', 45);

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(calls.length).toBe(1);

      const command = calls[0].args[0].input;
      expect(command.MetricData![0].MetricName).toBe('EventWriteLatency');
      expect(command.MetricData![0].Value).toBe(45);
      expect(command.MetricData![0].Unit).toBe('Milliseconds');
      expect(command.MetricData![0].Dimensions).toEqual([
        { Name: 'tenant_id', Value: 'tenant-123' },
        { Name: 'event_type', Value: 'GOAL_SCORED' },
        { Name: 'operation_type', Value: 'event_write' },
      ]);
    });
  });

  describe('emitCrossTenantAccessAttempt', () => {
    it('should emit cross-tenant access attempt metric', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await emitCrossTenantAccessAttempt('tenant-123', 'CROSS_TENANT_DATA_LEAKAGE');

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(calls.length).toBe(1);

      const command = calls[0].args[0].input;
      expect(command.MetricData![0].MetricName).toBe('CrossTenantAccessAttempt');
      expect(command.MetricData![0].Value).toBe(1);
      expect(command.MetricData![0].Unit).toBe('Count');
      expect(command.MetricData![0].Dimensions).toEqual([
        { Name: 'tenant_id', Value: 'tenant-123' },
        { Name: 'violation_type', Value: 'CROSS_TENANT_DATA_LEAKAGE' },
        { Name: 'operation_type', Value: 'security_violation' },
      ]);
    });
  });

  describe('measureDuration', () => {
    it('should measure operation duration and emit metric', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'result';
      };

      const result = await measureDuration(
        operation,
        MetricName.STANDINGS_CALCULATION_DURATION,
        { tenant_id: 'tenant-123' }
      );

      expect(result).toBe('result');

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(calls.length).toBe(1);

      const command = calls[0].args[0].input;
      expect(command.MetricData![0].MetricName).toBe('StandingsCalculationDuration');
      expect(command.MetricData![0].Value).toBeGreaterThanOrEqual(100);
      expect(command.MetricData![0].Unit).toBe('Milliseconds');
    });

    it('should emit metric even when operation fails', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        throw new Error('Operation failed');
      };

      await expect(
        measureDuration(
          operation,
          MetricName.EVENT_WRITE_LATENCY,
          { tenant_id: 'tenant-123' }
        )
      ).rejects.toThrow('Operation failed');

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(calls.length).toBe(1);

      const command = calls[0].args[0].input;
      expect(command.MetricData![0].MetricName).toBe('EventWriteLatency');
      expect(command.MetricData![0].Value).toBeGreaterThanOrEqual(50);
      expect(command.MetricData![0].Dimensions).toContainEqual(
        { Name: 'error', Value: 'true' }
      );
    });

    it('should measure very fast operations', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      const operation = async () => 'instant';

      await measureDuration(
        operation,
        MetricName.EVENT_WRITE_LATENCY,
        { tenant_id: 'tenant-123' }
      );

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(calls.length).toBe(1);

      const command = calls[0].args[0].input;
      expect(command.MetricData![0].Value).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should log error but not throw when CloudWatch API fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      cloudWatchMock.on(PutMetricDataCommand).rejects(new Error('API Error'));

      await emitStandingsCalculationDuration('tenant-123', 'season-456', 100);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to emit CloudWatch metric',
        expect.objectContaining({
          metricName: 'StandingsCalculationDuration',
          value: 100,
          error: 'API Error',
        })
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
