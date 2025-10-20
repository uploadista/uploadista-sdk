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
import type { FastifyReply } from "fastify";

// Re-export shared error types for backward compatibility
export {
  AdapterError as FastifyAdapterError,
  BaseValidationError as ValidationError,
  BaseNotFoundError as NotFoundError,
  BaseBadRequestError as BadRequestError,
};

/**
 * Sends error response using Fastify Reply object
 */
export const sendErrorResponse = (
  reply: FastifyReply,
  error: AdapterError,
): void => {
  reply.status(error.statusCode).send(createErrorResponseBody(error));
};

/**
 * Sends UploadistaError response using Fastify Reply object
 */
export const sendUploadistaErrorResponse = (
  reply: FastifyReply,
  error: UploadistaError,
): void => {
  reply.status(error.status).send(createUploadistaErrorResponseBody(error));
};

/**
 * Sends generic error response using Fastify Reply object
 */
export const sendGenericErrorResponse = (
  reply: FastifyReply,
  message = "Internal server error",
): void => {
  reply.status(500).send(createGenericErrorResponseBody(message));
};

/**
 * Universal error handler that sends error response via Fastify Reply.
 * Handles AdapterError, UploadistaError, and unknown errors.
 * This is the recommended way to handle errors in HTTP handlers.
 */
export const handleErrorResponse =
  (reply: FastifyReply) => (error: unknown) => {
    console.error(error);

    // Handle known adapter errors
    if (error instanceof AdapterError) {
      return Effect.sync(() => sendErrorResponse(reply, error));
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
        sendUploadistaErrorResponse(reply, error as UploadistaError),
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
      reply.status(status).send({
        error: message,
        code,
        timestamp: new Date().toISOString(),
      });
    });
  };
