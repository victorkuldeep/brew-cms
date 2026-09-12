import { DomainError } from '@brew-cms/core';

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
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

  // Fallback for unexpected internal errors: NEVER expose raw stack traces or internal SQL details
  const fallbackMessage = err instanceof Error ? err.message : 'An unexpected internal error occurred.';
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: fallbackMessage,
        requestId,
      },
    },
  };
}
