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
import type { Response } from "express";

// Re-export shared error types for backward compatibility
export {
  AdapterError as ExpressAdapterError,
  BaseValidationError as ValidationError,
  BaseNotFoundError as NotFoundError,
  BaseBadRequestError as BadRequestError,
};

/**
 * Sends error response using Express Response object
 */
export const sendErrorResponse = (res: Response, error: AdapterError): void => {
  res.status(error.statusCode).json(createErrorResponseBody(error));
};

/**
 * Sends UploadistaError response using Express Response object
 */
export const sendUploadistaErrorResponse = (
  res: Response,
  error: UploadistaError,
): void => {
  res.status(error.status).json(createUploadistaErrorResponseBody(error));
};

/**
 * Sends generic error response using Express Response object
 */
export const sendGenericErrorResponse = (
  res: Response,
  message = "Internal server error",
): void => {
  res.status(500).json(createGenericErrorResponseBody(message));
};

/**
 * Universal error handler that sends error response via Express Response.
 * Handles AdapterError, UploadistaError, and unknown errors.
 * This is the recommended way to handle errors in HTTP handlers.
 */
export const handleErrorResponse = (res: Response) => (error: unknown) => {
  console.error(error);

  // Handle known adapter errors
  if (error instanceof AdapterError) {
    return Effect.sync(() => sendErrorResponse(res, error));
  }

  // Handle UploadistaError
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "status" in error &&
    "body" in error
  ) {
    return Effect.sync(() =>
      sendUploadistaErrorResponse(res, error as UploadistaError),
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

  return Effect.sync(() => {
    res.status(status).json({
      error: message,
      code,
      timestamp: new Date().toISOString(),
    });
  });
};
