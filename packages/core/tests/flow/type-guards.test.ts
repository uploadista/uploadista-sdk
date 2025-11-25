import { describe, expect, it } from "vitest";
import {
  isFinalizeOperation,
  isInitOperation,
  isUploadOperation,
  isUrlOperation,
} from "../../src/flow/type-guards";

describe("Input Operation Type Guards", () => {
  describe("isInitOperation", () => {
    it("should return true for init operation", () => {
      const input = {
        operation: "init" as const,
        storageId: "s3",
        metadata: { filename: "test.jpg" },
      };

      expect(isInitOperation(input)).toBe(true);
    });

    it("should return false for url operation", () => {
      const input = {
        operation: "url" as const,
        url: "https://example.com/file.jpg",
      };

      expect(isInitOperation(input)).toBe(false);
    });

    it("should return false for finalize operation", () => {
      const input = {
        operation: "finalize" as const,
      };

      expect(isInitOperation(input)).toBe(false);
    });

    it("should narrow type correctly", () => {
      const input = {
        operation: "init" as const,
        storageId: "s3",
        metadata: { filename: "test.jpg" },
      };

      if (isInitOperation(input)) {
        // Type should be narrowed - these properties should be accessible
        expect(input.storageId).toBe("s3");
        expect(input.metadata).toEqual({ filename: "test.jpg" });
      } else {
        throw new Error("Type guard failed");
      }
    });
  });

  describe("isUrlOperation", () => {
    it("should return true for url operation", () => {
      const input = {
        operation: "url" as const,
        url: "https://example.com/file.jpg",
        storageId: "s3",
      };

      expect(isUrlOperation(input)).toBe(true);
    });

    it("should return false for init operation", () => {
      const input = {
        operation: "init" as const,
        storageId: "s3",
        metadata: {},
      };

      expect(isUrlOperation(input)).toBe(false);
    });

    it("should return false for finalize operation", () => {
      const input = {
        operation: "finalize" as const,
      };

      expect(isUrlOperation(input)).toBe(false);
    });

    it("should narrow type correctly", () => {
      const input = {
        operation: "url" as const,
        url: "https://example.com/file.jpg",
        storageId: "s3",
      };

      if (isUrlOperation(input)) {
        // Type should be narrowed - url property should be accessible
        expect(input.url).toBe("https://example.com/file.jpg");
        expect(input.storageId).toBe("s3");
      } else {
        throw new Error("Type guard failed");
      }
    });
  });

  describe("isFinalizeOperation", () => {
    it("should return true for finalize operation", () => {
      const input = {
        operation: "finalize" as const,
      };

      expect(isFinalizeOperation(input)).toBe(true);
    });

    it("should return false for init operation", () => {
      const input = {
        operation: "init" as const,
        storageId: "s3",
        metadata: {},
      };

      expect(isFinalizeOperation(input)).toBe(false);
    });

    it("should return false for url operation", () => {
      const input = {
        operation: "url" as const,
        url: "https://example.com/file.jpg",
      };

      expect(isFinalizeOperation(input)).toBe(false);
    });
  });

  describe("isUploadOperation", () => {
    it("should return true for init operation", () => {
      const input = {
        operation: "init" as const,
        storageId: "s3",
        metadata: {},
      };

      expect(isUploadOperation(input)).toBe(true);
    });

    it("should return true for url operation", () => {
      const input = {
        operation: "url" as const,
        url: "https://example.com/file.jpg",
      };

      expect(isUploadOperation(input)).toBe(true);
    });

    it("should return false for finalize operation", () => {
      const input = {
        operation: "finalize" as const,
      };

      expect(isUploadOperation(input)).toBe(false);
    });

    it("should narrow type to init or url", () => {
      const initInput = {
        operation: "init" as const,
        storageId: "s3",
        metadata: {},
      };

      const urlInput = {
        operation: "url" as const,
        url: "https://example.com/file.jpg",
      };

      if (isUploadOperation(initInput)) {
        expect(initInput.operation).toBe("init");
      }

      if (isUploadOperation(urlInput)) {
        expect(urlInput.operation).toBe("url");
      }
    });
  });
});
