/**
 * BrewCMS Domain Errors
 * Machine-readable, user-safe error types.
 */

export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code: string = 'DOMAIN_ERROR', statusCode: number = 400, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, identifier?: string) {
    super(
      identifier ? `${resource} with identifier '${identifier}' was not found.` : `${resource} not found.`,
      'NOT_FOUND',
      404
    );
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string = 'Authentication required.') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string = 'Permission denied.') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class PolicyDeniedError extends DomainError {
  public readonly decision: 'DENY' | 'REQUIRE_APPROVAL';
  public readonly reason?: string;

  constructor(decision: 'DENY' | 'REQUIRE_APPROVAL', reason?: string) {
    super(
      reason || (decision === 'REQUIRE_APPROVAL' ? 'Action requires human approval.' : 'Action denied by policy.'),
      decision === 'REQUIRE_APPROVAL' ? 'POLICY_APPROVAL_REQUIRED' : 'POLICY_DENIED',
      403,
      { decision, reason }
    );
    this.decision = decision;
    this.reason = reason;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 422, details);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Invalid workflow transition from state '${fromStatus}' to '${toStatus}'.`,
      'INVALID_STATE_TRANSITION',
      400,
      { fromStatus, toStatus }
    );
  }
}
