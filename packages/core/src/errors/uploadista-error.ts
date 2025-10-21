import { Data, Effect } from "effect";

/**
 * Union type of all possible error codes in the Uploadista system.
 *
 * Each error code corresponds to a specific error condition with predefined
 * HTTP status codes and messages in the ERROR_CATALOG.
 */
export type UploadistaErrorCode =
  | "MISSING_OFFSET"
  | "ABORTED"
  | "INVALID_TERMINATION"
  | "ERR_LOCK_TIMEOUT"
  | "INVALID_CONTENT_TYPE"
  | "FLOW_STRUCTURE_ERROR"
  | "FLOW_CYCLE_ERROR"
  | "FLOW_NODE_NOT_FOUND"
  | "FLOW_NODE_ERROR"
  | "FLOW_NOT_AUTHORIZED"
  | "FLOW_NOT_FOUND"
  | "FILE_READ_ERROR"
  | "FLOW_JOB_NOT_FOUND"
  | "FLOW_JOB_ERROR"
  | "DATASTORE_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "INVALID_OFFSET"
  | "FILE_NO_LONGER_EXISTS"
  | "ERR_SIZE_EXCEEDED"
  | "ERR_MAX_SIZE_EXCEEDED"
  | "INVALID_LENGTH"
  | "INVALID_METADATA"
  | "VALIDATION_ERROR"
  | "STORAGE_NOT_AUTHORIZED"
  | "UNKNOWN_ERROR"
  | "FILE_WRITE_ERROR"
  | "UPLOAD_ID_NOT_FOUND"
  | "FLOW_OUTPUT_VALIDATION_ERROR"
  | "FLOW_INPUT_VALIDATION_ERROR"
  | "CHECKSUM_MISMATCH"
  | "MIMETYPE_MISMATCH"
  | "UNSUPPORTED_CHECKSUM_ALGORITHM";

/**
 * Catalog of all predefined errors in the Uploadista system.
 *
 * Maps error codes to their HTTP status codes and default error messages.
 * This centralized catalog ensures consistent error handling across all
 * Uploadista packages and adapters.
 *
 * Each error entry contains:
 * - `status`: HTTP status code (400-500 range)
 * - `body`: Human-readable error message
 *
 * @example
 * ```typescript
 * // Access a specific error definition
 * const fileNotFound = ERROR_CATALOG.FILE_NOT_FOUND;
 * console.log(fileNotFound.status); // 404
 * console.log(fileNotFound.body);   // "The file for this url was not found\n"
 *
 * // Use with UploadistaError
 * const error = UploadistaError.fromCode("FILE_NOT_FOUND");
 * ```
 */
export const ERROR_CATALOG: Readonly<
  Record<UploadistaErrorCode, { status: number; body: string }>
> = {
  MISSING_OFFSET: { status: 403, body: "Upload-Offset header required\n" },
  ABORTED: { status: 400, body: "Request aborted due to lock acquired" },
  INVALID_TERMINATION: {
    status: 400,
    body: "Cannot terminate an already completed upload",
  },
  ERR_LOCK_TIMEOUT: {
    status: 500,
    body: "failed to acquire lock before timeout",
  },
  INVALID_CONTENT_TYPE: {
    status: 403,
    body: "Content-Type header required\n",
  },
  DATASTORE_NOT_FOUND: {
    status: 500,
    body: "The datastore was not found\n",
  },
  UPLOAD_ID_NOT_FOUND: {
    status: 500,
    body: "The upload id was not found\n",
  },
  FILE_NOT_FOUND: {
    status: 404,
    body: "The file for this url was not found\n",
  },
  FLOW_NOT_AUTHORIZED: {
    status: 401,
    body: "The flow is not authorized\n",
  },
  FLOW_NOT_FOUND: {
    status: 404,
    body: "The flow was not found\n",
  },
  FLOW_STRUCTURE_ERROR: {
    status: 500,
    body: "The flow structure is invalid\n",
  },
  FLOW_CYCLE_ERROR: {
    status: 500,
    body: "The flow contains a cycle\n",
  },
  FLOW_NODE_NOT_FOUND: {
    status: 500,
    body: "The flow node was not found\n",
  },
  FLOW_NODE_ERROR: {
    status: 500,
    body: "The flow node failed\n",
  },
  FLOW_JOB_NOT_FOUND: {
    status: 404,
    body: "The flow job was not found\n",
  },
  FLOW_JOB_ERROR: {
    status: 500,
    body: "The flow job failed\n",
  },
  FLOW_INPUT_VALIDATION_ERROR: {
    status: 500,
    body: "The flow input validation failed\n",
  },
  FLOW_OUTPUT_VALIDATION_ERROR: {
    status: 500,
    body: "The flow output validation failed\n",
  },
  INVALID_OFFSET: { status: 409, body: "Upload-Offset conflict\n" },
  FILE_NO_LONGER_EXISTS: {
    status: 410,
    body: "The file for this url no longer exists\n",
  },
  FILE_READ_ERROR: {
    status: 500,
    body: "Something went wrong reading the file\n",
  },
  ERR_SIZE_EXCEEDED: { status: 413, body: "upload's size exceeded\n" },
  ERR_MAX_SIZE_EXCEEDED: { status: 413, body: "Maximum size exceeded\n" },
  INVALID_LENGTH: {
    status: 400,
    body: "Upload-Length or Upload-Defer-Length header required\n",
  },
  INVALID_METADATA: {
    status: 400,
    body: "Upload-Metadata is invalid. It MUST consist of one or more comma-separated key-value pairs. The key and value MUST be separated by a space. The key MUST NOT contain spaces and commas and MUST NOT be empty. The key SHOULD be ASCII encoded and the value MUST be Base64 encoded. All keys MUST be unique",
  },
  VALIDATION_ERROR: {
    status: 400,
    body: "Validation failed\n",
  },
  STORAGE_NOT_AUTHORIZED: {
    status: 401,
    body: "The storage is not authorized\n",
  },
  UNKNOWN_ERROR: {
    status: 500,
    body: "Something went wrong with that request\n",
  },
  FILE_WRITE_ERROR: {
    status: 500,
    body: "Something went wrong receiving the file\n",
  },
  CHECKSUM_MISMATCH: {
    status: 400,
    body: "The file checksum does not match the provided checksum\n",
  },
  MIMETYPE_MISMATCH: {
    status: 400,
    body: "The file MIME type does not match the declared type\n",
  },
  UNSUPPORTED_CHECKSUM_ALGORITHM: {
    status: 400,
    body: "The specified checksum algorithm is not supported\n",
  },
  // UNSUPPORTED_CONCATENATION_EXTENSION: {
  //   status: 501,
  //   body: "Concatenation extension is not (yet) supported. Disable parallel uploads in the tus client.\n",
  // },
  // UNSUPPORTED_CREATION_DEFER_LENGTH_EXTENSION: {
  //   status: 501,
  //   body: "creation-defer-length extension is not (yet) supported.\n",
  // },
  // UNSUPPORTED_EXPIRATION_EXTENSION: {
  //   status: 501,
  //   body: "expiration extension is not (yet) supported.\n",
  // },
} as const;

/**
 * Standard error class for all Uploadista operations.
 *
 * UploadistaError provides a consistent error handling approach across the entire
 * Uploadista ecosystem. Each error has:
 * - A typed error code from the ERROR_CATALOG
 * - An HTTP-compatible status code
 * - A human-readable error message (body)
 * - Optional additional details and cause information
 *
 * This class integrates with Effect-TS for functional error handling and can be
 * easily converted to an Effect that fails.
 *
 * @example
 * ```typescript
 * // Create from error code
 * const error = UploadistaError.fromCode("FILE_NOT_FOUND");
 *
 * // Create with custom details
 * const customError = UploadistaError.fromCode("FLOW_NODE_ERROR", {
 *   body: "Failed to process image",
 *   cause: originalError,
 *   details: { nodeId: "resize-1", fileId: "abc123" }
 * });
 *
 * // Use with Effect
 * const effect = customError.toEffect<void>();
 *
 * // In an Effect pipeline
 * return Effect.gen(function* () {
 *   const file = yield* getFile(id);
 *   if (!file) {
 *     return yield* UploadistaError.fromCode("FILE_NOT_FOUND").toEffect();
 *   }
 *   return file;
 * });
 * ```
 */
export class UploadistaError extends Data.TaggedError("UploadistaError") {
  readonly code: string;
  readonly status: number;
  // Keep legacy property names for backward compatibility
  readonly status_code: number;
  readonly body: string;
  readonly details?: unknown;

  constructor({
    code,
    status,
    body,
    cause,
    details,
  }: {
    code: UploadistaErrorCode | string;
    status: number;
    body: string;
    cause?: unknown;
    details?: unknown;
  }) {
    super();
    this.name = "UploadistaError";
    this.code = code;
    this.status = status;
    this.status_code = status; // legacy alias
    this.body = body;
    this.details = details;
    if (cause) (this as unknown as { cause?: unknown }).cause = cause;
  }

  /**
   * Creates an UploadistaError from a predefined error code.
   *
   * This is the primary way to create errors in the Uploadista system. Each error code
   * has a default status and message defined in ERROR_CATALOG, but these can be overridden
   * for specific use cases.
   *
   * @param code - One of the predefined error codes from UploadistaErrorCode
   * @param overrides - Optional overrides for the default error properties
   * @param overrides.status - Custom HTTP status code (overrides the default)
   * @param overrides.body - Custom error message (overrides the default)
   * @param overrides.details - Additional structured data about the error
   * @param overrides.cause - The underlying error that caused this error (for error chaining)
   *
   * @returns A new UploadistaError instance
   *
   * @example
   * ```typescript
   * // Use default error
   * const error = UploadistaError.fromCode("FILE_NOT_FOUND");
   *
   * // Override message
   * const customError = UploadistaError.fromCode("FILE_NOT_FOUND", {
   *   body: `File with ID ${fileId} was not found in storage`
   * });
   *
   * // Include cause and details
   * const detailedError = UploadistaError.fromCode("DATASTORE_NOT_FOUND", {
   *   cause: storageException,
   *   details: { storageId: "s3-prod", region: "us-east-1" }
   * });
   * ```
   */
  static fromCode(
    code: UploadistaErrorCode,
    overrides?: Partial<Pick<UploadistaError, "status" | "body">> & {
      details?: unknown;
      cause?: unknown;
    }
  ): UploadistaError {
    const base = ERROR_CATALOG[code];
    return new UploadistaError({
      code,
      status: overrides?.status ?? base.status,
      body: overrides?.body ?? base.body,
      details: overrides?.details,
      cause: overrides?.cause,
    });
  }

  /**
   * Converts this error to an Effect that immediately fails.
   *
   * This method integrates UploadistaError with Effect-TS's error handling system,
   * allowing errors to be used in Effect pipelines with proper type checking.
   *
   * @template T - The success type of the Effect (defaults to never since it always fails)
   * @returns An Effect that fails with this UploadistaError
   *
   * @example
   * ```typescript
   * const error = UploadistaError.fromCode("FILE_NOT_FOUND");
   *
   * // Use in an Effect pipeline
   * return Effect.gen(function* () {
   *   const file = yield* kvStore.get(fileId);
   *   if (!file) {
   *     return yield* error.toEffect();
   *   }
   *   return file;
   * });
   * ```
   */
  toEffect<T = never>(): Effect.Effect<T, UploadistaError> {
    return Effect.fail(this);
  }
}

/**
 * Type guard to check if an unknown value is an UploadistaError.
 *
 * Useful for error handling when catching errors that might be from
 * different sources or libraries.
 *
 * @param error - The value to check
 * @returns True if the value is an UploadistaError instance
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   if (isUploadistaError(error)) {
 *     console.log(`Uploadista error: ${error.code} (${error.status})`);
 *     console.log(error.body);
 *   } else {
 *     console.error("Unknown error:", error);
 *   }
 * }
 * ```
 */
export function isUploadistaError(error: unknown): error is UploadistaError {
  return error instanceof UploadistaError;
}

/**
 * Creates an Effect that immediately fails with an UploadistaError.
 *
 * This is a convenience function that combines error creation with Effect conversion.
 * It's equivalent to calling `UploadistaError.fromCode(code, overrides).toEffect()`.
 *
 * @param code - One of the predefined error codes from UploadistaErrorCode
 * @param overrides - Optional overrides for the default error properties
 * @param overrides.status - Custom HTTP status code
 * @param overrides.body - Custom error message
 * @param overrides.details - Additional structured data about the error
 * @param overrides.cause - The underlying error that caused this error
 *
 * @returns An Effect that immediately fails with the created UploadistaError
 *
 * @example
 * ```typescript
 * // In an Effect pipeline
 * return Effect.gen(function* () {
 *   const file = yield* kvStore.get(fileId);
 *   if (!file) {
 *     return yield* httpFailureEffect("FILE_NOT_FOUND", {
 *       details: { fileId }
 *     });
 *   }
 *   return file;
 * });
 * ```
 */
export function httpFailureEffect(
  code: UploadistaErrorCode,
  overrides?: Partial<Pick<UploadistaError, "status" | "body">> & {
    details?: unknown;
    cause?: unknown;
  }
): Effect.Effect<never, UploadistaError> {
  return UploadistaError.fromCode(code, overrides).toEffect();
}
