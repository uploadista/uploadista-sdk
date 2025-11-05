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

export const handleR2NotFoundError = (
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

  return handleR2Error(operation, error, context);
};

export const isUploadNotFoundError = (
  error: unknown,
): error is { code: "NoSuchUpload" | "NoSuchKey" } => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code === "NoSuchUpload" || error.code === "NoSuchKey")
  );
};
