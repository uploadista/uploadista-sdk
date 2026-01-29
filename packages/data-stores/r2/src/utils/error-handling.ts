import { UploadistaError } from "@uploadista/core/errors";
import { trackS3Error as logR2Error } from "@uploadista/observability";
import { Effect } from "effect";

export const handleR2Error = (
  operation: string,
  error: unknown,
  context: Record<string, unknown> = {},
): UploadistaError => {
  // Log the error with context
  Effect.runSync(logR2Error(operation, error, context));

  return UploadistaError.fromCode("FILE_WRITE_ERROR", error as Error);
};

/**
 * Helper to check if an error code/name indicates a not found error
 */
const isNotFoundErrorCode = (codeOrName: string): boolean =>
  ["NotFound", "NoSuchKey", "NoSuchUpload"].includes(codeOrName);

/**
 * Helper to get the error identifier from an error object
 * AWS SDK errors may have the error code in either .code or .name
 */
const getErrorIdentifier = (
  error: unknown,
): { code?: string; name?: string } | null => {
  if (typeof error !== "object" || error === null) return null;

  const result: { code?: string; name?: string } = {};

  if ("code" in error && typeof error.code === "string") {
    result.code = error.code;
  }
  if ("name" in error && typeof error.name === "string") {
    result.name = error.name;
  }

  return Object.keys(result).length > 0 ? result : null;
};

export const handleR2NotFoundError = (
  operation: string,
  error: unknown,
  context: Record<string, unknown> = {},
): UploadistaError => {
  const errorId = getErrorIdentifier(error);

  if (
    errorId &&
    ((errorId.code && isNotFoundErrorCode(errorId.code)) ||
      (errorId.name && isNotFoundErrorCode(errorId.name)))
  ) {
    Effect.runSync(
      Effect.logWarning(`File not found during ${operation} operation`).pipe(
        Effect.annotateLogs({
          error_code: errorId.code,
          error_name: errorId.name,
          ...context,
        }),
      ),
    );
    return UploadistaError.fromCode("FILE_NOT_FOUND");
  }

  return handleR2Error(operation, error, context);
};

/**
 * Helper to check if an error code/name indicates an upload not found error
 */
const isUploadNotFoundCode = (codeOrName: string): boolean =>
  codeOrName === "NoSuchUpload" || codeOrName === "NoSuchKey";

export const isUploadNotFoundError = (
  error: unknown,
): error is { code?: string; name?: string } => {
  const errorId = getErrorIdentifier(error);

  // Check direct error code or name
  if (errorId) {
    if (errorId.code && isUploadNotFoundCode(errorId.code)) {
      return true;
    }
    if (errorId.name && isUploadNotFoundCode(errorId.name)) {
      return true;
    }
  }

  // Check if it's an UploadistaError wrapping an AWS error
  if (error instanceof UploadistaError && error.cause) {
    const causeErrorId = getErrorIdentifier(error.cause);
    if (causeErrorId) {
      if (causeErrorId.code && isUploadNotFoundCode(causeErrorId.code)) {
        return true;
      }
      if (causeErrorId.name && isUploadNotFoundCode(causeErrorId.name)) {
        return true;
      }
    }
  }

  return false;
};
