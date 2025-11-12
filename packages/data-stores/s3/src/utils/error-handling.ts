import { UploadistaError } from "@uploadista/core/errors";
import { trackS3Error as logS3Error } from "@uploadista/observability";
import { Effect } from "effect";

export const handleS3Error = (
  operation: string,
  error: unknown,
  context: Record<string, unknown> = {},
): UploadistaError => {
  // Log the error with context
  Effect.runSync(logS3Error(operation, error, context));

  return UploadistaError.fromCode("FILE_WRITE_ERROR", error as Error);
};

export const handleS3NotFoundError = (
  operation: string,
  error: unknown,
  context: Record<string, unknown> = {},
): UploadistaError => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    ["NotFound", "NoSuchKey", "NoSuchUpload"].includes(error.code)
  ) {
    Effect.runSync(
      Effect.logWarning(`File not found during ${operation} operation`).pipe(
        Effect.annotateLogs({
          error_code: error.code,
          ...context,
        }),
      ),
    );
    return UploadistaError.fromCode("FILE_NOT_FOUND");
  }

  return handleS3Error(operation, error, context);
};

export const isUploadNotFoundError = (
  error: unknown,
): error is { code: "NoSuchUpload" | "NoSuchKey" } => {
  // Check direct error code
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code === "NoSuchUpload" || error.code === "NoSuchKey")
  ) {
    return true;
  }

  // Check if it's an UploadistaError wrapping an AWS error with code
  if (
    error instanceof UploadistaError &&
    error.cause &&
    typeof error.cause === "object" &&
    "code" in error.cause &&
    typeof error.cause.code === "string" &&
    (error.cause.code === "NoSuchUpload" || error.cause.code === "NoSuchKey")
  ) {
    return true;
  }

  return false;
};
