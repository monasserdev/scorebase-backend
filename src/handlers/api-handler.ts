/**
 * Main Lambda Handler Entry Point
 * 
 * Handles all API Gateway requests with JWT validation, routing,
 * error handling, and structured logging.
 * 
 * Requirements: 8.1, 8.2, 11.1
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateJWT } from '../middleware/jwt-validation';
import { AuthError } from '../models/auth';
import { NotFoundError, BadRequestError, ForbiddenError, ServiceUnavailableError } from '../models/errors';
import {
  successResponse,
  authenticationErrorResponse,
  authorizationErrorResponse,
  notFoundErrorResponse,
  validationErrorResponse,
  internalErrorResponse,
  serviceUnavailableErrorResponse,
  generateRequestId,
} from '../utils/response-formatter';
import { HttpStatus } from '../models/response';
import { loadEnvironmentConfig } from '../config/environment';

// Import services
import { LeagueService } from '../services/league-service';
import { SeasonService } from '../services/season-service';
import { TeamService } from '../services/team-service';
import { PlayerService } from '../services/player-service';
import { GameService } from '../services/game-service';
import { EventService } from '../services/event-service';
import { StandingsService } from '../services/standings-service';

// Import repositories
import { LeagueRepository } from '../repositories/league-repository';
import { SeasonRepository } from '../repositories/season-repository';
import { TeamRepository } from '../repositories/team-repository';
import { PlayerRepository } from '../repositories/player-repository';
import { GameRepository } from '../repositories/game-repository';
import { StandingsRepository } from '../repositories/standings-repository';

/**
 * Route handler function type
 */
type RouteHandler = (
  event: APIGatewayProxyEvent,
  tenantId: string,
  userId: string,
  roles: string[],
  requestId: string
) => Promise<APIGatewayProxyResult>;

/**
 * Route definition
 */
interface Route {
  method: string;
  pathPattern: RegExp;
  handler: RouteHandler;
  requiredRole?: string;
}

/**
 * Initialize services (singleton pattern for Lambda warm starts)
 */
let services: {
  leagueService: LeagueService;
  seasonService: SeasonService;
  teamService: TeamService;
  playerService: PlayerService;
  gameService: GameService;
  eventService: EventService;
  standingsService: StandingsService;
} | null = null;

function getServices() {
  if (!services) {
    // Initialize repositories
    const leagueRepository = new LeagueRepository();
    const seasonRepository = new SeasonRepository();
    const teamRepository = new TeamRepository();
    const playerRepository = new PlayerRepository();
    const gameRepository = new GameRepository();
    const standingsRepository = new StandingsRepository();

    // Initialize services
    services = {
      leagueService: new LeagueService(leagueRepository),
      seasonService: new SeasonService(seasonRepository),
      teamService: new TeamService(teamRepository),
      playerService: new PlayerService(playerRepository),
      gameService: new GameService(gameRepository),
      eventService: new EventService(
        gameRepository,
        seasonRepository,
        teamRepository,
        standingsRepository
      ),
      standingsService: new StandingsService(standingsRepository),
    };
  }

  return services;
}

/**
 * Extract path parameter from event
 */
function getPathParameter(event: APIGatewayProxyEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) {
    throw new BadRequestError(`Missing path parameter: ${name}`);
  }
  return value;
}

/**
 * Extract query parameter from event
 */
function getQueryParameter(event: APIGatewayProxyEvent, name: string): string | undefined {
  return event.queryStringParameters?.[name];
}

/**
 * Parse request body
 */
function parseBody(event: APIGatewayProxyEvent): any {
  if (!event.body) {
    throw new BadRequestError('Request body is required');
  }

  try {
    return JSON.parse(event.body);
  } catch (error) {
    throw new BadRequestError('Invalid JSON in request body');
  }
}

/**
 * Route handlers
 */

// GET /v1/leagues
async function getLeagues(
  _event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { leagueService } = getServices();
  const leagues = await leagueService.getLeagues(tenantId);
  return successResponse({ leagues }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/leagues/{leagueId}
async function getLeagueById(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { leagueService } = getServices();
  const leagueId = getPathParameter(event, 'leagueId');
  const league = await leagueService.getLeagueById(tenantId, leagueId);
  return successResponse({ league }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/leagues/{leagueId}/seasons
async function getSeasonsByLeague(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { seasonService } = getServices();
  const leagueId = getPathParameter(event, 'leagueId');
  const seasons = await seasonService.getSeasonsByLeague(tenantId, leagueId);
  return successResponse({ seasons }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/seasons/{seasonId}
async function getSeasonById(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { seasonService } = getServices();
  const seasonId = getPathParameter(event, 'seasonId');
  const season = await seasonService.getSeasonById(tenantId, seasonId);
  return successResponse({ season }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/seasons/{seasonId}/games
async function getGamesBySeason(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { gameService } = getServices();
  const seasonId = getPathParameter(event, 'seasonId');
  
  // Extract optional filters from query parameters
  const filters: any = {};
  const status = getQueryParameter(event, 'status');
  const startDate = getQueryParameter(event, 'startDate');
  const endDate = getQueryParameter(event, 'endDate');
  const teamId = getQueryParameter(event, 'teamId');
  
  if (status) filters.status = status;
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (teamId) filters.teamId = teamId;
  
  const games = await gameService.getGamesBySeason(
    tenantId,
    seasonId,
    Object.keys(filters).length > 0 ? filters : undefined
  );
  
  return successResponse({ games }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/seasons/{seasonId}/standings
async function getStandingsBySeason(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { standingsService } = getServices();
  const seasonId = getPathParameter(event, 'seasonId');
  const standings = await standingsService.getStandingsBySeason(tenantId, seasonId);
  return successResponse({ standings }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/leagues/{leagueId}/teams
async function getTeamsByLeague(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { teamService } = getServices();
  const leagueId = getPathParameter(event, 'leagueId');
  const teams = await teamService.getTeamsByLeague(tenantId, leagueId);
  return successResponse({ teams }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/teams/{teamId}
async function getTeamById(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { teamService } = getServices();
  const teamId = getPathParameter(event, 'teamId');
  const team = await teamService.getTeamById(tenantId, teamId);
  return successResponse({ team }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/teams/{teamId}/players
async function getPlayersByTeam(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { playerService } = getServices();
  const teamId = getPathParameter(event, 'teamId');
  const players = await playerService.getPlayersByTeam(tenantId, teamId);
  return successResponse({ players }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/players/{playerId}
async function getPlayerById(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { playerService } = getServices();
  const playerId = getPathParameter(event, 'playerId');
  const player = await playerService.getPlayerById(tenantId, playerId);
  return successResponse({ player }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/games/{gameId}
async function getGameById(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { gameService } = getServices();
  const gameId = getPathParameter(event, 'gameId');
  const game = await gameService.getGameById(tenantId, gameId);
  return successResponse({ game }, HttpStatus.OK, undefined, requestId);
}

// GET /v1/games/{gameId}/events
async function getEventsByGame(
  event: APIGatewayProxyEvent,
  tenantId: string,
  _userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { eventService } = getServices();
  const gameId = getPathParameter(event, 'gameId');
  const events = await eventService.getEventsByGame(tenantId, gameId);
  return successResponse({ events }, HttpStatus.OK, undefined, requestId);
}

// POST /v1/games/{gameId}/events
async function createEvent(
  event: APIGatewayProxyEvent,
  tenantId: string,
  userId: string,
  _roles: string[],
  requestId: string
): Promise<APIGatewayProxyResult> {
  const { eventService } = getServices();
  const gameId = getPathParameter(event, 'gameId');
  const body = parseBody(event);
  
  // Validate required fields
  if (!body.event_type) {
    throw new BadRequestError('event_type is required');
  }
  if (!body.payload) {
    throw new BadRequestError('payload is required');
  }
  
  // Create event metadata
  const metadata = {
    user_id: userId,
    source: 'api',
    ip_address: event.requestContext?.identity?.sourceIp || 'unknown',
  };
  
  const createdEvent = await eventService.createEvent(
    tenantId,
    gameId,
    body.event_type,
    body.payload,
    metadata
  );
  
  return successResponse({ event: createdEvent }, HttpStatus.CREATED, undefined, requestId);
}

/**
 * Route definitions
 */
const routes: Route[] = [
  { method: 'GET', pathPattern: /^\/v1\/leagues$/, handler: getLeagues },
  { method: 'GET', pathPattern: /^\/v1\/leagues\/[^/]+$/, handler: getLeagueById },
  { method: 'GET', pathPattern: /^\/v1\/leagues\/[^/]+\/seasons$/, handler: getSeasonsByLeague },
  { method: 'GET', pathPattern: /^\/v1\/seasons\/[^/]+$/, handler: getSeasonById },
  { method: 'GET', pathPattern: /^\/v1\/seasons\/[^/]+\/games$/, handler: getGamesBySeason },
  { method: 'GET', pathPattern: /^\/v1\/seasons\/[^/]+\/standings$/, handler: getStandingsBySeason },
  { method: 'GET', pathPattern: /^\/v1\/leagues\/[^/]+\/teams$/, handler: getTeamsByLeague },
  { method: 'GET', pathPattern: /^\/v1\/teams\/[^/]+$/, handler: getTeamById },
  { method: 'GET', pathPattern: /^\/v1\/teams\/[^/]+\/players$/, handler: getPlayersByTeam },
  { method: 'GET', pathPattern: /^\/v1\/players\/[^/]+$/, handler: getPlayerById },
  { method: 'GET', pathPattern: /^\/v1\/games\/[^/]+$/, handler: getGameById },
  { method: 'GET', pathPattern: /^\/v1\/games\/[^/]+\/events$/, handler: getEventsByGame },
  { method: 'POST', pathPattern: /^\/v1\/games\/[^/]+\/events$/, handler: createEvent, requiredRole: 'scorekeeper' },
];

/**
 * Find matching route for request
 */
function findRoute(method: string, path: string): Route | null {
  return routes.find(route => 
    route.method === method && route.pathPattern.test(path)
  ) || null;
}

/**
 * Check if user has required role
 */
function hasRequiredRole(userRoles: string[], requiredRole?: string): boolean {
  if (!requiredRole) {
    return true;
  }
  return userRoles.includes(requiredRole);
}

/**
 * Log request to CloudWatch
 */
function logRequest(
  requestId: string,
  method: string,
  path: string,
  tenantId: string,
  userId: string,
  statusCode: number,
  latencyMs: number
): void {
  console.log(JSON.stringify({
    request_id: requestId,
    tenant_id: tenantId,
    user_id: userId,
    method,
    path,
    status_code: statusCode,
    latency_ms: latencyMs,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Main Lambda handler
 * 
 * This handler:
 * 1. Generates a unique request_id for tracing
 * 2. Extracts and validates JWT token from Authorization header
 * 3. Routes requests to appropriate service based on HTTP method and path
 * 4. Handles errors and formats responses
 * 5. Logs all requests to CloudWatch with structured logging
 * 
 * @param event - API Gateway proxy event
 * @returns API Gateway proxy result
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const method = event.httpMethod;
  const path = event.path;

  try {
    // Handle OPTIONS requests for CORS preflight
    if (method === 'OPTIONS') {
      return successResponse({}, HttpStatus.OK, undefined, requestId);
    }

    // Load environment configuration
    const config = loadEnvironmentConfig();
    const region = process.env.AWS_REGION || 'us-east-1';

    // Extract and validate JWT token
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    const authContext = await validateJWT(
      authHeader,
      config.cognitoUserPoolId,
      region
    );

    // Find matching route
    const route = findRoute(method, path);
    if (!route) {
      const latencyMs = Date.now() - startTime;
      logRequest(requestId, method, path, authContext.tenant_id, authContext.user_id, 404, latencyMs);
      return notFoundErrorResponse('Route not found', requestId);
    }

    // Check role-based authorization
    if (!hasRequiredRole(authContext.roles, route.requiredRole)) {
      const latencyMs = Date.now() - startTime;
      logRequest(requestId, method, path, authContext.tenant_id, authContext.user_id, 403, latencyMs);
      return authorizationErrorResponse(
        `Insufficient permissions. Required role: ${route.requiredRole}`,
        requestId
      );
    }

    // Execute route handler
    const result = await route.handler(
      event,
      authContext.tenant_id,
      authContext.user_id,
      authContext.roles,
      requestId
    );

    // Log successful request
    const latencyMs = Date.now() - startTime;
    logRequest(requestId, method, path, authContext.tenant_id, authContext.user_id, result.statusCode, latencyMs);

    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    // Handle authentication errors (401)
    if (error instanceof AuthError) {
      logRequest(requestId, method, path, 'unknown', 'unknown', 401, latencyMs);
      return authenticationErrorResponse(error.message, requestId);
    }

    // Handle authorization errors (403)
    if (error instanceof ForbiddenError) {
      logRequest(requestId, method, path, 'unknown', 'unknown', 403, latencyMs);
      return authorizationErrorResponse(error.message, requestId);
    }

    // Handle not found errors (404)
    if (error instanceof NotFoundError) {
      logRequest(requestId, method, path, 'unknown', 'unknown', 404, latencyMs);
      return notFoundErrorResponse(error.message, requestId);
    }

    // Handle validation errors (400)
    if (error instanceof BadRequestError) {
      logRequest(requestId, method, path, 'unknown', 'unknown', 400, latencyMs);
      return validationErrorResponse(error.message, (error as any).details, requestId);
    }

    // Handle service unavailable errors (503)
    if (error instanceof ServiceUnavailableError) {
      logRequest(requestId, method, path, 'unknown', 'unknown', 503, latencyMs);
      return serviceUnavailableErrorResponse(error.message, requestId);
    }

    // Handle database connection errors (503)
    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      logRequest(requestId, method, path, 'unknown', 'unknown', 503, latencyMs);
      return serviceUnavailableErrorResponse('Database connection failed', requestId);
    }

    // Handle generic errors (500)
    console.error('Unhandled error:', error);
    logRequest(requestId, method, path, 'unknown', 'unknown', 500, latencyMs);
    
    return internalErrorResponse(
      'Internal server error',
      process.env.NODE_ENV === 'development' ? { error: String(error) } : undefined,
      requestId
    );
  }
}
