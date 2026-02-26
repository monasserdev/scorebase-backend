/**
 * Example Usage: Multi-Tenant Isolation Middleware
 * 
 * This file demonstrates how to use the multi-tenant isolation middleware
 * in repository and service layers.
 * 
 * DO NOT import this file in production code - it's for documentation only.
 */

import {
  enforceMultiTenantIsolation,
  enforceMultiTenantIsolationSingle,
  enforceMultiTenantIsolationMany,
  TenantIsolationError,
  TenantIsolationErrorCode,
} from './multi-tenant-isolation';

/**
 * Example 1: Repository Layer - League Repository
 * 
 * Repositories should use enforceMultiTenantIsolation for all queries
 */
export class LeagueRepository {
  /**
   * Find all leagues for a tenant
   */
  async findByTenantId(tenantId: string) {
    return enforceMultiTenantIsolationMany(
      tenantId,
      'SELECT * FROM leagues WHERE tenant_id = $1 ORDER BY name',
      []
    );
  }

  /**
   * Find a specific league by ID
   */
  async findById(tenantId: string, leagueId: string) {
    return enforceMultiTenantIsolationSingle(
      tenantId,
      'SELECT * FROM leagues WHERE tenant_id = $1 AND league_id = $2',
      [leagueId]
    );
  }

  /**
   * Find leagues by sport type
   */
  async findBySportType(tenantId: string, sportType: string) {
    return enforceMultiTenantIsolationMany(
      tenantId,
      'SELECT * FROM leagues WHERE tenant_id = $1 AND sport_type = $2',
      [sportType]
    );
  }
}

/**
 * Example 2: Repository Layer - Game Repository with Complex Filters
 */
export class GameRepository {
  /**
   * Find games by season with optional filters
   */
  async findBySeasonId(
    tenantId: string,
    seasonId: string,
    filters?: {
      status?: string;
      startDate?: Date;
      endDate?: Date;
      teamId?: string;
    }
  ) {
    // Build dynamic query with filters
    const conditions: string[] = ['tenant_id = $1', 'season_id = $2'];
    const params: any[] = [seasonId];
    let paramIndex = 3;

    if (filters?.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.startDate) {
      conditions.push(`scheduled_at >= $${paramIndex}`);
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      conditions.push(`scheduled_at <= $${paramIndex}`);
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.teamId) {
      conditions.push(`(home_team_id = $${paramIndex} OR away_team_id = $${paramIndex})`);
      params.push(filters.teamId);
      paramIndex++;
    }

    const query = `
      SELECT * FROM games 
      WHERE ${conditions.join(' AND ')}
      ORDER BY scheduled_at
    `;

    return enforceMultiTenantIsolationMany(tenantId, query, params);
  }
}

/**
 * Example 3: Service Layer - Error Handling
 */
export class LeagueService {
  constructor(private leagueRepository: LeagueRepository) {}

  /**
   * Get leagues with proper error handling
   */
  async getLeagues(tenantId: string) {
    try {
      const leagues = await this.leagueRepository.findByTenantId(tenantId);
      return leagues;
    } catch (error) {
      if (error instanceof TenantIsolationError) {
        // Log security violation
        console.error('Tenant isolation error:', {
          code: error.code,
          message: error.message,
          details: error.details,
        });

        // Return appropriate error response
        switch (error.code) {
          case TenantIsolationErrorCode.INVALID_TENANT_ID:
            throw new Error('Invalid tenant identifier');
          case TenantIsolationErrorCode.QUERY_MISSING_TENANT_FILTER:
            // This should never happen in production - indicates a bug
            throw new Error('Internal security error');
          case TenantIsolationErrorCode.TENANT_ISOLATION_VIOLATION:
            throw new Error('Access denied to requested resource');
        }
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get league by ID with 404 handling
   */
  async getLeagueById(tenantId: string, leagueId: string) {
    const league = await this.leagueRepository.findById(tenantId, leagueId);

    if (!league) {
      throw new Error('League not found');
    }

    return league;
  }
}

/**
 * Example 4: Lambda Handler - Integration with JWT Validation
 */
export async function handleGetLeagues(event: any) {
  try {
    // Step 1: Validate JWT and extract tenant_id
    const authContext = await validateJWT(
      event.headers.Authorization,
      process.env.USER_POOL_ID!,
      process.env.AWS_REGION!
    );

    // Step 2: Use tenant_id from JWT claims (never from request body!)
    const tenantId = authContext.tenant_id;

    // Step 3: Query with tenant isolation
    const leagues = await enforceMultiTenantIsolationMany(
      tenantId,
      'SELECT * FROM leagues WHERE tenant_id = $1',
      []
    );

    // Step 4: Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        request_id: generateUUID(),
        timestamp: new Date().toISOString(),
        data: leagues,
      }),
    };
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: {
            code: error.code,
            message: 'Access denied to requested resource',
          },
        }),
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      }),
    };
  }
}

/**
 * Example 5: Transaction with Multi-Tenant Isolation
 */
export async function updateStandingsWithIsolation(
  tenantId: string,
  seasonId: string,
  standings: any[]
) {
  const { transaction } = await import('../config/database');

  return transaction(async (client) => {
    // All queries within transaction must include tenant_id
    for (const standing of standings) {
      await enforceMultiTenantIsolation(
        tenantId,
        `
          INSERT INTO standings (tenant_id, season_id, team_id, wins, losses, points)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (season_id, team_id) 
          DO UPDATE SET wins = $4, losses = $5, points = $6
        `,
        [seasonId, standing.team_id, standing.wins, standing.losses, standing.points]
      );
    }
  });
}

/**
 * Example 6: Aggregate Queries (no tenant_id in result)
 */
export async function getLeagueCount(tenantId: string) {
  const result = await enforceMultiTenantIsolationSingle<{ count: string }>(
    tenantId,
    'SELECT COUNT(*) as count FROM leagues WHERE tenant_id = $1',
    []
  );

  return result ? parseInt(result.count, 10) : 0;
}

/**
 * Example 7: JOIN Queries with Multiple Tables
 */
export async function getGamesWithTeams(tenantId: string, seasonId: string) {
  return enforceMultiTenantIsolationMany(
    tenantId,
    `
      SELECT 
        g.game_id,
        g.scheduled_at,
        g.status,
        g.home_score,
        g.away_score,
        ht.name as home_team_name,
        at.name as away_team_name
      FROM games g
      JOIN teams ht ON g.home_team_id = ht.team_id
      JOIN teams at ON g.away_team_id = at.team_id
      WHERE g.tenant_id = $1 
        AND g.season_id = $2
        AND ht.tenant_id = $1
        AND at.tenant_id = $1
      ORDER BY g.scheduled_at
    `,
    [seasonId]
  );
}

// Helper function placeholder
function validateJWT(auth: string, poolId: string, region: string): Promise<any> {
  throw new Error('Not implemented - see jwt-validation.ts');
}

function generateUUID(): string {
  throw new Error('Not implemented');
}
