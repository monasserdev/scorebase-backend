/**
 * CloudWatch Metrics Utilities
 * 
 * Provides functions to emit custom CloudWatch metrics for monitoring
 * business-specific operations like standings calculations, event writes,
 * and security violations.
 * 
 * Requirements: 9.1, 9.2, 9.3, 2.4
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';

/**
 * CloudWatch client instance
 * Reused across Lambda invocations for connection pooling
 */
const cloudWatchClient = new CloudWatchClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Namespace for custom metrics
 */
const METRIC_NAMESPACE = 'ScoreBase/Backend';

/**
 * Metric names
 */
export enum MetricName {
  STANDINGS_CALCULATION_DURATION = 'StandingsCalculationDuration',
  EVENT_WRITE_LATENCY = 'EventWriteLatency',
  CROSS_TENANT_ACCESS_ATTEMPT = 'CrossTenantAccessAttempt',
}

/**
 * Metric units
 */
export enum MetricUnit {
  MILLISECONDS = 'Milliseconds',
  COUNT = 'Count',
}

/**
 * Metric dimensions for filtering and grouping
 */
export interface MetricDimensions {
  tenant_id?: string;
  operation_type?: string;
  event_type?: string;
  violation_type?: string;
  [key: string]: string | undefined;
}

/**
 * Emit a custom CloudWatch metric
 * 
 * @param metricName - Name of the metric
 * @param value - Metric value
 * @param unit - Metric unit (Milliseconds, Count, etc.)
 * @param dimensions - Optional dimensions for filtering
 */
export async function emitMetric(
  metricName: MetricName,
  value: number,
  unit: MetricUnit,
  dimensions?: MetricDimensions
): Promise<void> {
  try {
    const metricData: MetricDatum = {
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: new Date(),
    };

    // Add dimensions if provided
    if (dimensions) {
      metricData.Dimensions = Object.entries(dimensions)
        .filter(([_, value]) => value !== undefined)
        .map(([name, value]) => ({
          Name: name,
          Value: value as string,
        }));
    }

    const command = new PutMetricDataCommand({
      Namespace: METRIC_NAMESPACE,
      MetricData: [metricData],
    });

    await cloudWatchClient.send(command);
  } catch (error) {
    // Log error but don't throw - metrics should not break application flow
    console.error('Failed to emit CloudWatch metric', {
      metricName,
      value,
      unit,
      dimensions,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Emit standings calculation duration metric
 * 
 * Tracks how long it takes to recalculate standings for a season.
 * This helps monitor performance and identify slow calculations.
 * 
 * @param tenantId - Tenant identifier
 * @param seasonId - Season identifier
 * @param durationMs - Duration in milliseconds
 */
export async function emitStandingsCalculationDuration(
  tenantId: string,
  seasonId: string,
  durationMs: number
): Promise<void> {
  await emitMetric(
    MetricName.STANDINGS_CALCULATION_DURATION,
    durationMs,
    MetricUnit.MILLISECONDS,
    {
      tenant_id: tenantId,
      season_id: seasonId,
      operation_type: 'standings_calculation',
    }
  );
}

/**
 * Emit event write latency metric
 * 
 * Tracks how long it takes to write an event to DynamoDB.
 * This helps monitor event write performance and identify bottlenecks.
 * 
 * @param tenantId - Tenant identifier
 * @param eventType - Type of event being written
 * @param latencyMs - Latency in milliseconds
 */
export async function emitEventWriteLatency(
  tenantId: string,
  eventType: string,
  latencyMs: number
): Promise<void> {
  await emitMetric(
    MetricName.EVENT_WRITE_LATENCY,
    latencyMs,
    MetricUnit.MILLISECONDS,
    {
      tenant_id: tenantId,
      event_type: eventType,
      operation_type: 'event_write',
    }
  );
}

/**
 * Emit cross-tenant access attempt metric
 * 
 * Tracks security violations where a tenant attempts to access
 * data belonging to another tenant. This is a critical security metric.
 * 
 * @param tenantId - Tenant identifier making the request
 * @param violationType - Type of violation (e.g., CROSS_TENANT_DATA_LEAKAGE)
 */
export async function emitCrossTenantAccessAttempt(
  tenantId: string,
  violationType: string
): Promise<void> {
  await emitMetric(
    MetricName.CROSS_TENANT_ACCESS_ATTEMPT,
    1,
    MetricUnit.COUNT,
    {
      tenant_id: tenantId,
      violation_type: violationType,
      operation_type: 'security_violation',
    }
  );
}

/**
 * Measure and emit duration for an async operation
 * 
 * Utility function to measure the duration of an async operation
 * and emit a metric with the result.
 * 
 * @param operation - Async operation to measure
 * @param metricName - Name of the metric to emit
 * @param dimensions - Optional dimensions for the metric
 * @returns Result of the operation
 */
export async function measureDuration<T>(
  operation: () => Promise<T>,
  metricName: MetricName,
  dimensions?: MetricDimensions
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    
    await emitMetric(metricName, duration, MetricUnit.MILLISECONDS, dimensions);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Emit metric even on error to track failed operation duration
    await emitMetric(metricName, duration, MetricUnit.MILLISECONDS, {
      ...dimensions,
      error: 'true',
    });
    
    throw error;
  }
}
