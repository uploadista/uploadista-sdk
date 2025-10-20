import type { UploadistaError } from "@uploadista/core/errors";
import {
  AdapterError,
  BadRequestError as BaseBadRequestError,
  NotFoundError as BaseNotFoundError,
  ValidationError as BaseValidationError,
  createErrorResponseBody,
  createGenericErrorResponseBody,
  createUploadistaErrorResponseBody,
} from "@uploadista/server";
import { Effect } from "effect";

// Re-export shared error types for backward compatibility
export {
  AdapterError as HonoAdapterError,
  BaseValidationError as ValidationError,
  BaseNotFoundError as NotFoundError,
  BaseBadRequestError as BadRequestError,
};

/**
 * Creates a Hono Response from AdapterError
 */
export const createErrorResponse = (error: AdapterError): Response => {
  return new Response(JSON.stringify(createErrorResponseBody(error)), {
    status: error.statusCode,
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * Creates a Hono Response from UploadistaError
 */
export const createUploadistaErrorResponse = (
  error: UploadistaError,
): Response => {
  return new Response(
    JSON.stringify(createUploadistaErrorResponseBody(error)),
    {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    },
  );
};

/**
 * Creates a generic error Response
 */
export const createGenericErrorResponse = (
  message = "Internal server error",
): Response => {
  return new Response(JSON.stringify(createGenericErrorResponseBody(message)), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * Universal error handler that creates an Effect with an error Response.
 * Handles AdapterError, UploadistaError, and unknown errors.
 * This is the recommended way to handle errors in HTTP handlers.
 */
export const handleErrorResponse = (error: unknown) => {
  console.error(error);

  // Handle known adapter errors
  if (error instanceof AdapterError) {
    return Effect.succeed(createErrorResponse(error));
  }

  // Handle UploadistaError
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "status" in error &&
    "body" in error
  ) {
    return Effect.succeed(
      createUploadistaErrorResponse(error as UploadistaError),
    );
  }

  // Handle unknown errors - try to extract what we can
  let message = "Internal server error";
  let code = "UNKNOWN_ERROR";
  let status = 500;

  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, unknown>;

    if ("message" in errorObj && typeof errorObj.message === "string") {
      message = errorObj.message;
    }

    if ("code" in errorObj && typeof errorObj.code === "string") {
      code = errorObj.code;
    }

    if ("status" in errorObj && typeof errorObj.status === "number") {
      status = errorObj.status;
    }
  }

  return Effect.succeed(
    new Response(
      JSON.stringify({
        error: message,
        code,
        timestamp: new Date().toISOString(),
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
};
