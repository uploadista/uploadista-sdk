import type { UploadistaError } from "@uploadista/core/errors";

/**
 * Base adapter error class for HTTP adapters
 */
export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly errorCode: string = "INTERNAL_ERROR",
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

export class ValidationError extends AdapterError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AdapterError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends AdapterError {
  constructor(message: string) {
    super(message, 400, "BAD_REQUEST");
    this.name = "BadRequestError";
  }
}

/**
 * Creates a standardized error response object
 */
export const createErrorResponseBody = (error: AdapterError) => ({
  error: error.message,
  code: error.errorCode,
  timestamp: new Date().toISOString(),
});

/**
 * Creates a standardized error response body from UploadistaError
 */
export const createUploadistaErrorResponseBody = (error: UploadistaError) => {
  const response: {
    error: string;
    code: string;
    timestamp: string;
    details?: unknown;
  } = {
    error: error.body,
    code: error.code,
    timestamp: new Date().toISOString(),
  };

  if (error.details !== undefined) {
    response.details = error.details;
  }

  return response;
};

/**
 * Creates a generic error response body
 */
export const createGenericErrorResponseBody = (
  message = "Internal server error",
) => ({
  error: message,
  code: "INTERNAL_ERROR",
  timestamp: new Date().toISOString(),
});
