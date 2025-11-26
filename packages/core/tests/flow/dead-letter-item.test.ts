import { describe, expect, it } from "vitest";
import type {
  DeadLetterError,
  DeadLetterItem,
  DeadLetterItemStatus,
  DeadLetterListOptions,
  DeadLetterRetryAttempt,
} from "../../src/flow/types/dead-letter-item";

describe("DeadLetterItem Types", () => {
  describe("DeadLetterItemStatus", () => {
    it("should have valid status values", () => {
      const statuses: DeadLetterItemStatus[] = [
        "pending",
        "retrying",
        "exhausted",
        "resolved",
      ];
      expect(statuses).toHaveLength(4);
      expect(statuses).toContain("pending");
      expect(statuses).toContain("retrying");
      expect(statuses).toContain("exhausted");
      expect(statuses).toContain("resolved");
    });
  });

  describe("DeadLetterError", () => {
    it("should have required properties", () => {
      const error: DeadLetterError = {
        code: "FLOW_NODE_ERROR",
        message: "External service timeout",
      };

      expect(error.code).toBe("FLOW_NODE_ERROR");
      expect(error.message).toBe("External service timeout");
      expect(error.nodeId).toBeUndefined();
      expect(error.stack).toBeUndefined();
    });

    it("should support optional properties", () => {
      const errorWithOptionals: DeadLetterError = {
        code: "FLOW_NODE_ERROR",
        message: "Processing failed",
        nodeId: "resize-node",
        stack: "Error: Processing failed\n  at resize...",
      };

      expect(errorWithOptionals.nodeId).toBe("resize-node");
      expect(errorWithOptionals.stack).toContain("Error: Processing failed");
    });
  });

  describe("DeadLetterRetryAttempt", () => {
    it("should capture retry attempt details", () => {
      const attempt: DeadLetterRetryAttempt = {
        attemptedAt: new Date("2024-01-15T10:30:00Z"),
        error: "Connection timeout",
        durationMs: 5000,
      };

      expect(attempt.attemptedAt).toBeInstanceOf(Date);
      expect(attempt.error).toBe("Connection timeout");
      expect(attempt.durationMs).toBe(5000);
    });

    it("should handle zero duration", () => {
      const attempt: DeadLetterRetryAttempt = {
        attemptedAt: new Date(),
        error: "Immediate failure",
        durationMs: 0,
      };

      expect(attempt.durationMs).toBe(0);
    });
  });

  describe("DeadLetterItem", () => {
    const createValidItem = (): DeadLetterItem => ({
      id: "dlq_abc123",
      jobId: "job_xyz789",
      flowId: "image-pipeline",
      storageId: "s3-production",
      clientId: "client_456",
      error: {
        code: "FLOW_NODE_ERROR",
        message: "External service timeout",
        nodeId: "resize-node",
      },
      inputs: { input: { uploadId: "upload_123" } },
      nodeResults: { "input-node": { file: { id: "file_123" } } },
      failedAtNodeId: "resize-node",
      retryCount: 2,
      maxRetries: 3,
      nextRetryAt: new Date("2024-01-15T10:35:00Z"),
      retryHistory: [
        {
          attemptedAt: new Date("2024-01-15T10:30:00Z"),
          error: "Timeout",
          durationMs: 5000,
        },
        {
          attemptedAt: new Date("2024-01-15T10:32:00Z"),
          error: "Timeout",
          durationMs: 5000,
        },
      ],
      createdAt: new Date("2024-01-15T10:30:00Z"),
      updatedAt: new Date("2024-01-15T10:32:00Z"),
      expiresAt: new Date("2024-01-22T10:30:00Z"),
      status: "pending",
    });

    it("should have all required properties", () => {
      const item = createValidItem();

      expect(item.id).toBe("dlq_abc123");
      expect(item.jobId).toBe("job_xyz789");
      expect(item.flowId).toBe("image-pipeline");
      expect(item.storageId).toBe("s3-production");
      expect(item.clientId).toBe("client_456");
      expect(item.error.code).toBe("FLOW_NODE_ERROR");
      expect(item.inputs).toBeDefined();
      expect(item.nodeResults).toBeDefined();
      expect(item.retryCount).toBe(2);
      expect(item.maxRetries).toBe(3);
      expect(item.retryHistory).toHaveLength(2);
      expect(item.createdAt).toBeInstanceOf(Date);
      expect(item.updatedAt).toBeInstanceOf(Date);
      expect(item.status).toBe("pending");
    });

    it("should allow null clientId for anonymous jobs", () => {
      const item = createValidItem();
      item.clientId = null;

      expect(item.clientId).toBeNull();
    });

    it("should handle empty retry history", () => {
      const item = createValidItem();
      item.retryHistory = [];
      item.retryCount = 0;

      expect(item.retryHistory).toHaveLength(0);
      expect(item.retryCount).toBe(0);
    });

    it("should handle optional failedAtNodeId", () => {
      const item = createValidItem();
      item.failedAtNodeId = undefined;

      expect(item.failedAtNodeId).toBeUndefined();
    });

    it("should handle optional nextRetryAt", () => {
      const item = createValidItem();
      item.nextRetryAt = undefined;

      expect(item.nextRetryAt).toBeUndefined();
    });

    it("should handle optional expiresAt", () => {
      const item = createValidItem();
      item.expiresAt = undefined;

      expect(item.expiresAt).toBeUndefined();
    });

    it("should support all status transitions", () => {
      const item = createValidItem();

      // pending -> retrying
      item.status = "retrying";
      expect(item.status).toBe("retrying");

      // retrying -> pending (retry failed)
      item.status = "pending";
      expect(item.status).toBe("pending");

      // retrying -> exhausted (max retries reached)
      item.status = "exhausted";
      expect(item.status).toBe("exhausted");

      // retrying -> resolved (retry succeeded)
      item.status = "resolved";
      expect(item.status).toBe("resolved");
    });

    it("should handle complex inputs and nodeResults", () => {
      const item = createValidItem();
      item.inputs = {
        "input-1": {
          uploadId: "upload_123",
          metadata: { width: 1920, height: 1080 },
          tags: ["photo", "landscape"],
        },
        "input-2": {
          url: "https://example.com/file.jpg",
        },
      };
      item.nodeResults = {
        "input-node": {
          file: {
            id: "file_123",
            size: 1024000,
            mimeType: "image/jpeg",
          },
        },
        "resize-node": {
          thumbnail: {
            width: 200,
            height: 150,
          },
        },
      };

      expect(item.inputs["input-1"]).toBeDefined();
      expect(item.nodeResults["resize-node"]).toBeDefined();
    });
  });

  describe("DeadLetterListOptions", () => {
    it("should support status filter", () => {
      const options: DeadLetterListOptions = {
        status: "pending",
      };

      expect(options.status).toBe("pending");
    });

    it("should support flowId filter", () => {
      const options: DeadLetterListOptions = {
        flowId: "image-pipeline",
      };

      expect(options.flowId).toBe("image-pipeline");
    });

    it("should support clientId filter", () => {
      const options: DeadLetterListOptions = {
        clientId: "client_123",
      };

      expect(options.clientId).toBe("client_123");
    });

    it("should support pagination", () => {
      const options: DeadLetterListOptions = {
        limit: 25,
        offset: 50,
      };

      expect(options.limit).toBe(25);
      expect(options.offset).toBe(50);
    });

    it("should support all options combined", () => {
      const options: DeadLetterListOptions = {
        status: "exhausted",
        flowId: "video-transcode",
        clientId: "client_456",
        limit: 100,
        offset: 0,
      };

      expect(options.status).toBe("exhausted");
      expect(options.flowId).toBe("video-transcode");
      expect(options.clientId).toBe("client_456");
      expect(options.limit).toBe(100);
      expect(options.offset).toBe(0);
    });

    it("should have all optional fields", () => {
      const options: DeadLetterListOptions = {};

      expect(options.status).toBeUndefined();
      expect(options.flowId).toBeUndefined();
      expect(options.clientId).toBeUndefined();
      expect(options.limit).toBeUndefined();
      expect(options.offset).toBeUndefined();
    });
  });
});
