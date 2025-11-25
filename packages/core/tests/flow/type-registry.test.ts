import { describe, expect, it } from "vitest";
import { STREAMING_INPUT_TYPE_ID } from "../../src/flow/node-types";
import { validateFlowInput } from "../../src/flow/input-type-registry";

describe("Flow Input Validation", () => {
  describe("validateFlowInput", () => {
    it("should validate init operation successfully", () => {
      const input = {
        operation: "init",
        storageId: "s3-production",
        metadata: {
          originalName: "test.jpg",
          mimeType: "image/jpeg",
          size: 1024,
        },
      };

      const result = validateFlowInput(STREAMING_INPUT_TYPE_ID, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it("should validate url operation successfully", () => {
      const input = {
        operation: "url",
        url: "https://example.com/image.jpg",
        storageId: "s3-production",
        metadata: {
          source: "external",
        },
      };

      const result = validateFlowInput(STREAMING_INPUT_TYPE_ID, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it("should validate finalize operation successfully", () => {
      const input = {
        operation: "finalize",
        uploadId: "upload-123",
      };

      const result = validateFlowInput(STREAMING_INPUT_TYPE_ID, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it("should fail validation for missing operation field", () => {
      const input = {
        storageId: "s3-production",
        metadata: {},
      };

      const result = validateFlowInput(STREAMING_INPUT_TYPE_ID, input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should fail validation for invalid operation type", () => {
      const input = {
        operation: "invalid-operation",
        storageId: "s3-production",
      };

      const result = validateFlowInput(STREAMING_INPUT_TYPE_ID, input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should fail validation for init operation missing storageId", () => {
      const input = {
        operation: "init",
        metadata: {},
      };

      const result = validateFlowInput(STREAMING_INPUT_TYPE_ID, input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should fail validation for url operation missing url field", () => {
      const input = {
        operation: "url",
        storageId: "s3-production",
      };

      const result = validateFlowInput(STREAMING_INPUT_TYPE_ID, input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should fail validation for unregistered type ID", () => {
      const input = {
        operation: "init",
        storageId: "s3-production",
        metadata: {},
      };

      const result = validateFlowInput("non-existent-type-id", input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        // UploadistaError uses body property for the message
        expect(result.error.body).toBeDefined();
        expect(result.error.body.length).toBeGreaterThan(0);
        expect(result.error.body).toContain("not registered");
      }
    });

    it("should handle url operation with optional metadata", () => {
      const input = {
        operation: "url",
        url: "https://example.com/file.jpg",
        storageId: "gcs-bucket",
        metadata: {
          source: "external-api",
          fetchedAt: "2025-01-21T10:00:00Z",
        },
      };

      const result = validateFlowInput(STREAMING_INPUT_TYPE_ID, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata).toEqual(input.metadata);
      }
    });

    it("should handle init operation with custom metadata fields", () => {
      const input = {
        operation: "init",
        storageId: "azure-blob",
        metadata: {
          originalName: "document.pdf",
          mimeType: "application/pdf",
          size: 50000,
          uploadedBy: "user-123",
          customField: "custom-value",
        },
      };

      const result = validateFlowInput(STREAMING_INPUT_TYPE_ID, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata).toEqual(input.metadata);
      }
    });
  });
});
