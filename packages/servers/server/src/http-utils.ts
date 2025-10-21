/**
 * Shared HTTP utilities for server adapters
 *
 * This module provides routing and error handling utilities used across
 * Hono, Express, and Fastify adapters for request parsing and response formatting.
 */

/**
 * Parses URL segments from a pathname, filtering out empty segments.
 * Useful for extracting route components from request paths.
 *
 * @param pathname - The URL pathname (e.g., "/uploadista/api/upload/abc123")
 * @returns Array of non-empty path segments
 *
 * @example
 * ```typescript
 * const segments = parseUrlSegments("/uploadista/api/upload/abc123");
 * // => ["uploadista", "api", "upload", "abc123"]
 * ```
 */
export const parseUrlSegments = (pathname: string): string[] => {
  return pathname.split("/").filter(Boolean);
};

/**
 * Extracts the last segment from a URL pathname.
 *
 * @param pathname - The URL pathname to parse
 * @returns The last non-empty segment, or undefined if none exists
 *
 * @example
 * ```typescript
 * const id = getLastSegment("/uploadista/api/upload/abc123");
 * // => "abc123"
 * ```
 */
export const getLastSegment = (pathname: string): string | undefined => {
  const segments = parseUrlSegments(pathname);
  return segments[segments.length - 1];
};

/**
 * Checks if a pathname includes a specific base path and API prefix.
 * Used to determine if a request should be handled by the Uploadista adapter.
 *
 * @param pathname - The request pathname
 * @param basePath - The base path configured for the adapter (e.g., "uploadista")
 * @returns true if the path includes `{basePath}/api/`
 *
 * @example
 * ```typescript
 * const isUploadistaPath = hasBasePath("/uploadista/api/upload", "uploadista");
 * // => true
 * ```
 */
export const hasBasePath = (pathname: string, basePath: string): boolean => {
  return pathname.includes(`${basePath}/api/`);
};

/**
 * Removes the base path prefix and returns clean route segments.
 * Transforms "/uploadista/api/upload/abc123" → ["upload", "abc123"]
 *
 * @param pathname - The full request pathname
 * @param basePath - The base path to remove (e.g., "uploadista")
 * @returns Array of route segments without base path prefix
 *
 * @example
 * ```typescript
 * const route = getRouteSegments("/uploadista/api/upload/abc123", "uploadista");
 * // => ["upload", "abc123"]
 * ```
 */
export const getRouteSegments = (
  pathname: string,
  basePath: string,
): string[] => {
  return pathname.replace(`${basePath}/api/`, "").split("/").filter(Boolean);
};

/**
 * Standard error handler for flow and job operations.
 * Maps application errors to appropriate HTTP status codes and error formats.
 *
 * Supports errors with `code`, `message`, `status`, and `details` properties.
 * Maps error codes to HTTP status codes (e.g., NOT_FOUND → 404, VALIDATION_ERROR → 400).
 *
 * @param error - The error object to handle (can be any type)
 * @returns Standardized error response with status, code, message, and optional details
 *
 * @example
 * ```typescript
 * import { handleFlowError } from "@uploadista/server";
 *
 * const response = handleFlowError({
 *   code: "FLOW_JOB_NOT_FOUND",
 *   message: "Job not found",
 * });
 * // => { status: 404, code: "FLOW_JOB_NOT_FOUND", message: "Job not found" }
 * ```
 */
export const handleFlowError = (
  error: unknown,
): { status: number; code: string; message: string; details?: unknown } => {
  let status = 500;
  let code = "UNKNOWN_ERROR";
  let message = "Internal server error";
  let details: unknown;

  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, unknown>;

    // Extract error code
    if ("code" in errorObj && typeof errorObj.code === "string") {
      code = errorObj.code;
    }

    // Extract message
    if ("message" in errorObj && typeof errorObj.message === "string") {
      message = errorObj.message;
    } else if ("body" in errorObj && typeof errorObj.body === "string") {
      // Support UploadistaError's body property
      message = errorObj.body;
    }

    // Extract details if present
    if ("details" in errorObj) {
      details = errorObj.details;
    }

    // Map error codes to HTTP status codes
    if ("status" in errorObj && typeof errorObj.status === "number") {
      status = errorObj.status;
    } else if ("code" in errorObj) {
      // Fallback: derive status from common error codes
      switch (errorObj.code) {
        case "FILE_NOT_FOUND":
        case "FLOW_JOB_NOT_FOUND":
        case "UPLOAD_ID_NOT_FOUND":
          status = 404;
          break;
        case "FLOW_JOB_ERROR":
        case "VALIDATION_ERROR":
        case "INVALID_METADATA":
        case "INVALID_LENGTH":
        case "ABORTED":
        case "INVALID_TERMINATION":
          status = 400;
          break;
        case "INVALID_OFFSET":
          status = 409;
          break;
        case "ERR_SIZE_EXCEEDED":
        case "ERR_MAX_SIZE_EXCEEDED":
          status = 413;
          break;
        case "FILE_NO_LONGER_EXISTS":
          status = 410;
          break;
        case "MISSING_OFFSET":
        case "INVALID_CONTENT_TYPE":
          status = 403;
          break;
        default:
          status = 500;
      }
    }

    // Special handling for specific error messages
    if ("message" in errorObj && errorObj.message === "Invalid JSON body") {
      status = 400;
      code = "VALIDATION_ERROR";
    }
  }

  const result: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } = {
    status,
    code,
    message,
  };

  if (details !== undefined) {
    result.details = details;
  }

  return result;
};

/**
 * Extracts job ID from URL segments for job status endpoint.
 * Expected URL format: `/uploadista/api/jobs/:jobId/status`
 *
 * @param urlSegments - Parsed URL segments (without base path)
 * @returns The job ID if found, or undefined
 *
 * @example
 * ```typescript
 * const jobId = extractJobIdFromStatus(["jobs", "job-123", "status"]);
 * // => "job-123"
 * ```
 */
export const extractJobIdFromStatus = (
  urlSegments: string[],
): string | undefined => {
  return urlSegments[urlSegments.length - 2];
};

/**
 * Extracts job ID and node ID from URL segments for continue flow endpoint.
 * Expected URL format: `/uploadista/api/jobs/:jobId/continue/:nodeId`
 *
 * @param urlSegments - Parsed URL segments (without base path)
 * @returns Object with extracted jobId and nodeId (either can be undefined if not found)
 *
 * @example
 * ```typescript
 * const { jobId, nodeId } = extractJobAndNodeId([
 *   "jobs",
 *   "job-123",
 *   "continue",
 *   "node-456",
 * ]);
 * // => { jobId: "job-123", nodeId: "node-456" }
 * ```
 */
export const extractJobAndNodeId = (
  urlSegments: string[],
): { jobId: string | undefined; nodeId: string | undefined } => {
  return {
    jobId: urlSegments[urlSegments.length - 3],
    nodeId: urlSegments[urlSegments.length - 1],
  };
};

/**
 * Extracts flow ID and storage ID from URL segments.
 * Expected URL format: `/uploadista/api/flow/:flowId/:storageId`
 *
 * Mutates the input array (removes last 2 elements).
 *
 * @param urlSegments - Parsed URL segments (will be mutated)
 * @returns Object with extracted flowId and storageId
 *
 * @example
 * ```typescript
 * const segments = ["flow", "flow-123", "storage-456"];
 * const { flowId, storageId } = extractFlowAndStorageId(segments);
 * // => { flowId: "flow-123", storageId: "storage-456" }
 * // segments is now ["flow"]
 * ```
 */
export const extractFlowAndStorageId = (
  urlSegments: string[],
): { flowId: string | undefined; storageId: string | undefined } => {
  return {
    storageId: urlSegments.pop(),
    flowId: urlSegments.pop(),
  };
};
