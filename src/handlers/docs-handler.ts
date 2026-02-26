import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Lambda handler for serving API documentation
 * 
 * This handler serves the Swagger UI and OpenAPI specification files
 * at the /api-docs endpoint.
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestPath = event.path;

  try {
    // Serve the main HTML page
    if (requestPath === '/api-docs' || requestPath === '/api-docs/') {
      const htmlContent = fs.readFileSync(
        path.join(__dirname, '../../docs/api-docs.html'),
        'utf-8'
      );
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'public, max-age=3600',
        },
        body: htmlContent,
      };
    }

    // Serve the OpenAPI YAML specification
    if (requestPath === '/api-docs/openapi.yaml') {
      const yamlContent = fs.readFileSync(
        path.join(__dirname, '../../docs/openapi.yaml'),
        'utf-8'
      );
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/x-yaml',
          'Cache-Control': 'public, max-age=3600',
        },
        body: yamlContent,
      };
    }

    // Serve the OpenAPI JSON specification
    if (requestPath === '/api-docs/openapi.json') {
      const jsonContent = fs.readFileSync(
        path.join(__dirname, '../../docs/openapi.json'),
        'utf-8'
      );
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
        body: jsonContent,
      };
    }

    // 404 for unknown paths
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'Documentation resource not found',
        },
      }),
    };
  } catch (error) {
    console.error('Error serving documentation:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to serve documentation',
        },
      }),
    };
  }
};
