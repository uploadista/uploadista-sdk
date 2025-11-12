import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import {
  ERROR_CATALOG,
  httpFailure,
  isUploadistaError,
  UploadistaError,
  type UploadistaErrorCode,
} from "../../src/errors";

describe("ERROR_CATALOG", () => {
  it("should contain all error codes with status and body", () => {
    const errorCodes: UploadistaErrorCode[] = [
      "MISSING_OFFSET",
      "ABORTED",
      "INVALID_TERMINATION",
      "ERR_LOCK_TIMEOUT",
      "INVALID_CONTENT_TYPE",
      "FLOW_STRUCTURE_ERROR",
      "FLOW_CYCLE_ERROR",
      "FLOW_NODE_NOT_FOUND",
      "FLOW_NODE_ERROR",
      "DATASTORE_NOT_FOUND",
      "FILE_NOT_FOUND",
      "INVALID_OFFSET",
      "FILE_NO_LONGER_EXISTS",
      "ERR_SIZE_EXCEEDED",
      "ERR_MAX_SIZE_EXCEEDED",
      "INVALID_LENGTH",
      "INVALID_METADATA",
      "UNKNOWN_ERROR",
      "FILE_WRITE_ERROR",
      "UPLOAD_ID_NOT_FOUND",
      "FLOW_OUTPUT_VALIDATION_ERROR",
      "FLOW_INPUT_VALIDATION_ERROR",
    ];

    for (const code of errorCodes) {
      expect(ERROR_CATALOG[code]).toBeDefined();
      expect(ERROR_CATALOG[code]).toHaveProperty("status");
      expect(ERROR_CATALOG[code]).toHaveProperty("body");
      expect(typeof ERROR_CATALOG[code].status).toBe("number");
      expect(typeof ERROR_CATALOG[code].body).toBe("string");
    }
  });

  it("should have appropriate HTTP status codes", () => {
    expect(ERROR_CATALOG.MISSING_OFFSET.status).toBe(403);
    expect(ERROR_CATALOG.FILE_NOT_FOUND.status).toBe(404);
    expect(ERROR_CATALOG.INVALID_OFFSET.status).toBe(409);
    expect(ERROR_CATALOG.FILE_NO_LONGER_EXISTS.status).toBe(410);
    expect(ERROR_CATALOG.ERR_SIZE_EXCEEDED.status).toBe(413);
    expect(ERROR_CATALOG.UNKNOWN_ERROR.status).toBe(500);
  });

  it("should have meaningful error messages", () => {
    expect(ERROR_CATALOG.MISSING_OFFSET.body).toContain("Upload-Offset");
    expect(ERROR_CATALOG.FILE_NOT_FOUND.body).toContain("file");
    expect(ERROR_CATALOG.FLOW_CYCLE_ERROR.body).toContain("cycle");
    expect(ERROR_CATALOG.ERR_MAX_SIZE_EXCEEDED.body).toContain("Maximum size");
  });
});

describe("UploadistaError", () => {
  it("should create error with all properties", () => {
    const error = new UploadistaError({
      code: "FILE_NOT_FOUND",
      status: 404,
      body: "File not found",
      cause: new Error("underlying error"),
      details: { fileId: "123" },
    });

    expect(error.name).toBe("UploadistaError");
    expect(error.code).toBe("FILE_NOT_FOUND");
    expect(error.status).toBe(404);
    expect(error.status_code).toBe(404); // legacy alias
    expect(error.body).toBe("File not found");
    expect(error.details).toEqual({ fileId: "123" });
    expect((error as { cause?: unknown }).cause).toBeInstanceOf(Error);
  });

  it("should create error without optional properties", () => {
    const error = new UploadistaError({
      code: "UNKNOWN_ERROR",
      status: 500,
      body: "Something went wrong",
    });

    expect(error.code).toBe("UNKNOWN_ERROR");
    expect(error.status).toBe(500);
    expect(error.body).toBe("Something went wrong");
    expect(error.details).toBeUndefined();
    expect((error as { cause?: unknown }).cause).toBeUndefined();
  });

  it("should inherit from Error", () => {
    const error = new UploadistaError({
      code: "FILE_NOT_FOUND",
      status: 404,
      body: "File not found",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UploadistaError);
  });

  describe("fromCode", () => {
    it("should create error from error code", () => {
      const error = UploadistaError.fromCode("FILE_NOT_FOUND");

      expect(error.code).toBe("FILE_NOT_FOUND");
      expect(error.status).toBe(ERROR_CATALOG.FILE_NOT_FOUND.status);
      expect(error.body).toBe(ERROR_CATALOG.FILE_NOT_FOUND.body);
    });

    it("should allow overriding status and body", () => {
      const error = UploadistaError.fromCode("FILE_NOT_FOUND", {
        status: 400,
        body: "Custom message",
      });

      expect(error.code).toBe("FILE_NOT_FOUND");
      expect(error.status).toBe(400);
      expect(error.body).toBe("Custom message");
    });

    it("should include details and cause when provided", () => {
      const cause = new Error("root cause");
      const error = UploadistaError.fromCode("UNKNOWN_ERROR", {
        details: { extra: "info" },
        cause: cause,
      });

      expect(error.details).toEqual({ extra: "info" });
      expect((error as { cause?: unknown }).cause).toBe(cause);
    });

    it("should work with all error codes", () => {
      const errorCodes: UploadistaErrorCode[] = [
        "MISSING_OFFSET",
        "ABORTED",
        "INVALID_TERMINATION",
        "ERR_LOCK_TIMEOUT",
        "INVALID_CONTENT_TYPE",
        "FLOW_STRUCTURE_ERROR",
        "FLOW_CYCLE_ERROR",
        "FLOW_NODE_NOT_FOUND",
        "FLOW_NODE_ERROR",
        "DATASTORE_NOT_FOUND",
        "FILE_NOT_FOUND",
        "INVALID_OFFSET",
        "FILE_NO_LONGER_EXISTS",
        "ERR_SIZE_EXCEEDED",
        "ERR_MAX_SIZE_EXCEEDED",
        "INVALID_LENGTH",
        "INVALID_METADATA",
        "UNKNOWN_ERROR",
        "FILE_WRITE_ERROR",
        "UPLOAD_ID_NOT_FOUND",
        "FLOW_OUTPUT_VALIDATION_ERROR",
        "FLOW_INPUT_VALIDATION_ERROR",
      ];

      for (const code of errorCodes) {
        const error = UploadistaError.fromCode(code);
        expect(error.code).toBe(code);
        expect(error.status).toBe(ERROR_CATALOG[code].status);
        expect(error.body).toBe(ERROR_CATALOG[code].body);
      }
    });
  });

  describe("toFailure", () => {
    it("should convert error to failure result", async () => {
      const error = UploadistaError.fromCode("FILE_NOT_FOUND");
      const effect = error.toEffect();

      const result = await Effect.runPromiseExit(effect);

      expect(Exit.isFailure(result)).toBe(true);
      expect(Exit.isSuccess(result)).toBe(false);
    });
  });
});

describe("isUploadistaError", () => {
  it("should return true for UploadistaError instances", () => {
    const error = UploadistaError.fromCode("FILE_NOT_FOUND");
    expect(isUploadistaError(error)).toBe(true);
  });

  it("should return false for regular Error instances", () => {
    const error = new Error("regular error");
    expect(isUploadistaError(error)).toBe(false);
  });

  it("should return false for non-error values", () => {
    expect(isUploadistaError("string")).toBe(false);
    expect(isUploadistaError(null)).toBe(false);
    expect(isUploadistaError(undefined)).toBe(false);
    expect(isUploadistaError({})).toBe(false);
    expect(isUploadistaError(123)).toBe(false);
  });

  it("should work as type guard", () => {
    const error: unknown = UploadistaError.fromCode("FILE_NOT_FOUND");

    if (isUploadistaError(error)) {
      // TypeScript should know error is UploadistaError
      expect(error.code).toBe("FILE_NOT_FOUND");
      expect(error.status).toBe(404);
    } else {
      expect.fail("Should be UploadistaError");
    }
  });
});

describe("httpFailure", () => {
  it("should create failure result from error code", async () => {
    const effect = httpFailure("FILE_NOT_FOUND");
    const result = await Effect.runPromiseExit(effect);

    expect(Exit.isFailure(result)).toBe(true);
    expect(Exit.isSuccess(result)).toBe(false);
  });

  it("should allow overriding error properties", async () => {
    const effect = httpFailure("UNKNOWN_ERROR", {
      status: 503,
      body: "Service unavailable",
      details: { retryAfter: 60 },
    });
    const result = await Effect.runPromiseExit(effect);

    expect(Exit.isFailure(result)).toBe(true);
    expect(Exit.isSuccess(result)).toBe(false);
  });

  it("should work with all error codes", async () => {
    const errorCodes: UploadistaErrorCode[] = [
      "MISSING_OFFSET",
      "FLOW_NODE_ERROR",
      "INVALID_METADATA",
    ];

    for (const code of errorCodes) {
      const effect = httpFailure(code);
      const result = await Effect.runPromiseExit(effect);
      expect(Exit.isFailure(result)).toBe(true);
      expect(Exit.isSuccess(result)).toBe(false);
    }
  });
});
