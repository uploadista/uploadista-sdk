/**
 * Shared HTTP utilities for adapters
 */

/**
 * Parses URL segments from a pathname, filtering out empty segments
 */
export const parseUrlSegments = (pathname: string): string[] => {
  return pathname.split("/").filter(Boolean);
};

/**
 * Extracts the last segment from a URL pathname
 */
export const getLastSegment = (pathname: string): string | undefined => {
  const segments = parseUrlSegments(pathname);
  return segments[segments.length - 1];
};

/**
 * Checks if a pathname includes a specific base path
 */
export const hasBasePath = (pathname: string, basePath: string): boolean => {
  return pathname.includes(`${basePath}/api/`);
};

/**
 * Removes the base path prefix and returns clean route segments
 */
export const getRouteSegments = (
  pathname: string,
  basePath: string,
): string[] => {
  return pathname.replace(`${basePath}/api/`, "").split("/").filter(Boolean);
};

/**
 * Standard error handling for flow/job operations
 * Returns status code, error code, message, and optional details based on error properties
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
 * Extracts job ID from URL segments for job status endpoint
 * Expected format: .../jobs/:jobId/status
 */
export const extractJobIdFromStatus = (
  urlSegments: string[],
): string | undefined => {
  return urlSegments[urlSegments.length - 2];
};

/**
 * Extracts job ID and node ID from URL segments for continue flow endpoint
 * Expected format: .../jobs/:jobId/continue/:nodeId
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
 * Extracts flow ID and storage ID from URL segments
 * Expected format: .../flow/:flowId/:storageId
 */
export const extractFlowAndStorageId = (
  urlSegments: string[],
): { flowId: string | undefined; storageId: string | undefined } => {
  return {
    storageId: urlSegments.pop(),
    flowId: urlSegments.pop(),
  };
};
