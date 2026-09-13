import { ZodError } from 'zod';
import { DomainError } from '@brew-cms/core';

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

/**
 * Explicit API-layer error with a stable machine-readable code.
 * Prefer these (or core DomainError subclasses) over ad-hoc inline
 * `{ error: { code } }` bodies so every failure carries requestId.
 */
export class ApiError extends DomainError {
  constructor(message: string, code: string, statusCode: number, details?: unknown) {
    super(message, code, statusCode, details);
  }
}

export class NoMediaRepositoryError extends ApiError {
  constructor() {
    super('Media repository not configured.', 'NO_MEDIA_REPO', 500);
  }
}

export class IntelligenceUnavailableError extends ApiError {
  constructor(message = 'Intelligence service is not configured.') {
    super(message, 'INTELLIGENCE_UNAVAILABLE', 503);
  }
}

export class InvalidQueryError extends ApiError {
  constructor(message = "Query parameter 'q' is required.") {
    super(message, 'INVALID_QUERY', 400);
  }
}

export class RouteNotFoundError extends ApiError {
  constructor(path: string) {
    super(`No route matches '${path}'.`, 'ROUTE_NOT_FOUND', 404, { path });
  }
}

export function formatErrorResponse(
  err: unknown,
  requestId?: string
): { status: number; body: ApiErrorEnvelope } {
  if (err instanceof DomainError) {
    return {
      status: err.statusCode,
      body: {
        error: {
          code: err.code,
          message: err.message,
          requestId,
          details: err.details,
        },
      },
    };
  }

  // Zod input validation → stable 422 (never 500 for client mistakes)
  if (err instanceof ZodError) {
    return {
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          requestId,
          details: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code,
          })),
        },
      },
    };
  }

  // Fallback: NEVER expose raw messages (may contain SQL internals),
  // stack traces, or secrets. Correlate via requestId in server logs.
  // eslint-disable-next-line no-console
  console.error(`[brew-cms:api] internal error (requestId=${requestId ?? 'n/a'}):`, err);
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred.',
        requestId,
      },
    },
  };
}
