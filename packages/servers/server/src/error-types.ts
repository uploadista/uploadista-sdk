import type { UploadistaError } from "@uploadista/core/errors";

/**
 * Base adapter error class for HTTP adapters.
 * All adapter-specific errors should extend this class or one of its subclasses.
 *
 * @example
 * ```typescript
 * throw new AdapterError("Something went wrong", 500, "INTERNAL_ERROR");
 * ```
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

/**
 * Validation error - indicates invalid request data or parameters.
 * Returns HTTP 400 Bad Request status.
 *
 * @example
 * ```typescript
 * if (!isValidUploadId(id)) {
 *   throw new ValidationError("Invalid upload ID format");
 * }
 * ```
 */
export class ValidationError extends AdapterError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

/**
 * Not found error - indicates a requested resource does not exist.
 * Returns HTTP 404 Not Found status.
 *
 * @example
 * ```typescript
 * if (!upload) {
 *   throw new NotFoundError("Upload");
 * }
 * ```
 */
export class NotFoundError extends AdapterError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/**
 * Bad request error - indicates a malformed request.
 * Returns HTTP 400 Bad Request status.
 * Similar to ValidationError but for request structure issues.
 *
 * @example
 * ```typescript
 * try {
 *   const data = JSON.parse(body);
 * } catch {
 *   throw new BadRequestError("Invalid JSON body");
 * }
 * ```
 */
export class BadRequestError extends AdapterError {
  constructor(message: string) {
    super(message, 400, "BAD_REQUEST");
    this.name = "BadRequestError";
  }
}

/**
 * Creates a standardized error response object for AdapterError.
 * Includes error message, error code, and ISO timestamp.
 *
 * @param error - The AdapterError to format
 * @returns Standardized error response body
 *
 * @example
 * ```typescript
 * import { createErrorResponseBody } from "@uploadista/server";
 *
 * try {
 *   // ... operation
 * } catch (err) {
 *   const errorResponse = createErrorResponseBody(err);
 *   res.status(err.statusCode).json(errorResponse);
 * }
 * ```
 */
export const createErrorResponseBody = (error: AdapterError) => ({
  error: error.message,
  code: error.errorCode,
  timestamp: new Date().toISOString(),
});

/**
 * Creates a standardized error response body from UploadistaError.
 * Formats core library errors for HTTP responses with optional details.
 *
 * @param error - The UploadistaError to format
 * @returns Standardized error response body with error, code, timestamp, and optional details
 *
 * @example
 * ```typescript
 * import { createUploadistaErrorResponseBody } from "@uploadista/server";
 *
 * try {
 *   const result = yield* uploadEngine.handleUpload(input);
 * } catch (err) {
 *   if (err instanceof UploadistaError) {
 *     const errorResponse = createUploadistaErrorResponseBody(err);
 *     res.status(400).json(errorResponse);
 *   }
 * }
 * ```
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
 * Creates a generic error response body for unknown/unexpected errors.
 * Used as a fallback when error type cannot be determined.
 *
 * @param message - Error message to include in response (defaults to "Internal server error")
 * @returns Standardized error response body with generic INTERNAL_ERROR code
 *
 * @example
 * ```typescript
 * import { createGenericErrorResponseBody } from "@uploadista/server";
 *
 * try {
 *   // ... operation
 * } catch (err) {
 *   const errorResponse = createGenericErrorResponseBody(
 *     err instanceof Error ? err.message : "Unknown error"
 *   );
 *   res.status(500).json(errorResponse);
 * }
 * ```
 */
export const createGenericErrorResponseBody = (
  message = "Internal server error",
) => ({
  error: message,
  code: "INTERNAL_ERROR",
  timestamp: new Date().toISOString(),
});
