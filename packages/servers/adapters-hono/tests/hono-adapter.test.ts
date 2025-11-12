/**
 * Tests for Hono Adapter Integration
 *
 * Covers:
 * - HTTP request extraction from Hono Context
 * - Response sending via Hono Context
 * - Request routing (upload, flow, jobs)
 * - HTTP method handling (GET, POST, PATCH)
 * - Error handling
 * - Auth middleware integration
 * - Request/response transformations
 */

import { it } from "@effect/vitest";
import type { AuthResult } from "@uploadista/server";
import { Effect } from "effect";
import type { Context, Env } from "hono";
import { describe, expect, vi } from "vitest";
import { honoAdapter } from "../src/hono-adapter";
import { extractHonoRequest, sendHonoResponse } from "../src/hono-http-handler";

describe("Hono Adapter Integration", () => {
  describe("Request Extraction", () => {
    it.effect("should extract create-upload request", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "POST",
              url: "http://localhost/uploadista/api/upload",
              json: async () => ({
                storageId: "test-storage",
                size: 1024,
                type: "image/jpeg",
                fileName: "test.jpg",
              }),
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("create-upload");
        if (result.type === "create-upload") {
          expect(result.data).toHaveProperty("storageId");
          expect(result.data).toHaveProperty("fileName");
        }
      }),
    );

    it.effect("should extract get-upload request", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "GET",
              url: "http://localhost/uploadista/api/upload/upload-123",
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("get-upload");
        if (result.type === "get-upload") {
          expect(result.uploadId).toBe("upload-123");
        }
      }),
    );

    it.effect("should extract upload-chunk request", () =>
      Effect.gen(function* () {
        const mockChunkData = new ReadableStream();

        const mockContext = {
          req: {
            raw: {
              method: "PATCH",
              url: "http://localhost/uploadista/api/upload/upload-123",
              body: mockChunkData,
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("upload-chunk");
        if (result.type === "upload-chunk") {
          expect(result.uploadId).toBe("upload-123");
          expect(result.data).toBeDefined();
        }
      }),
    );

    it.effect("should extract get-capabilities request", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "GET",
              url: "http://localhost/uploadista/api/upload/test-storage/capabilities?storageId=test-storage",
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("get-capabilities");
        if (result.type === "get-capabilities") {
          expect(result.storageId).toBe("test-storage");
        }
      }),
    );

    it.effect("should extract run-flow request", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "POST",
              url: "http://localhost/uploadista/api/flow/flow-123/storage-456",
              json: async () => ({
                inputs: { file: "data" },
              }),
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("run-flow");
        if (result.type === "run-flow") {
          expect(result.flowId).toBe("flow-123");
          expect(result.storageId).toBe("storage-456");
          expect(result.inputs).toHaveProperty("file");
        }
      }),
    );

    it.effect("should extract job-status request", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "GET",
              url: "http://localhost/uploadista/api/jobs/job-123/status",
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("job-status");
        if (result.type === "job-status") {
          expect(result.jobId).toBe("job-123");
        }
      }),
    );

    it.effect("should extract resume-flow request with JSON", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "PATCH",
              url: "http://localhost/uploadista/api/jobs/job-123/resume/node-456",
              headers: new Headers({ "Content-Type": "application/json" }),
              json: async () => ({ newData: { result: "approved" } }),
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("resume-flow");
        if (result.type === "resume-flow") {
          expect(result.jobId).toBe("job-123");
          expect(result.nodeId).toBe("node-456");
          expect(result.newData).toEqual({ result: "approved" });
        }
      }),
    );

    it.effect("should extract resume-flow request with stream", () =>
      Effect.gen(function* () {
        const mockStream = new ReadableStream();

        const mockContext = {
          req: {
            raw: {
              method: "PATCH",
              url: "http://localhost/uploadista/api/jobs/job-123/resume/node-456",
              headers: new Headers({
                "Content-Type": "application/octet-stream",
              }),
              body: mockStream,
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("resume-flow");
        if (result.type === "resume-flow") {
          expect(result.jobId).toBe("job-123");
          expect(result.nodeId).toBe("node-456");
          expect(result.newData).toBe(mockStream);
        }
      }),
    );

    it.effect("should return not-found for invalid routes", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "GET",
              url: "http://localhost/invalid/path",
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("not-found");
      }),
    );

    it.effect("should return method-not-allowed for unsupported methods", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "DELETE",
              url: "http://localhost/uploadista/api/upload/upload-123",
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("method-not-allowed");
      }),
    );

    it.effect("should return bad-request for missing required data", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "PATCH",
              url: "http://localhost/uploadista/api/upload/upload-123",
              body: null,
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("bad-request");
        if (result.type === "bad-request") {
          expect(result.message).toContain("required");
        }
      }),
    );

    it.effect("should handle pause-flow request", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "POST",
              url: "http://localhost/uploadista/api/jobs/job-123/pause",
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("pause-flow");
        if (result.type === "pause-flow") {
          expect(result.jobId).toBe("job-123");
        }
      }),
    );

    it.effect("should handle cancel-flow request", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "POST",
              url: "http://localhost/uploadista/api/jobs/job-123/cancel",
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("cancel-flow");
        if (result.type === "cancel-flow") {
          expect(result.jobId).toBe("job-123");
        }
      }),
    );
  });

  describe("Response Sending", () => {
    it.effect("should send success response", () =>
      Effect.gen(function* () {
        const mockContext = {} as unknown as Context<Env>;

        const response = {
          status: 200,
          body: { success: true, data: { id: "upload-123" } },
          headers: {},
        };

        const result = yield* sendHonoResponse(response, mockContext);

        expect(result).toBeInstanceOf(Response);
        expect(result.status).toBe(200);

        const body = yield* Effect.promise(() => result.json());
        expect(body).toHaveProperty("success", true);
        expect(body).toHaveProperty("data");
      }),
    );

    it.effect("should send error response", () =>
      Effect.gen(function* () {
        const mockContext = {} as unknown as Context<Env>;

        const response = {
          status: 400,
          body: { error: "Invalid request" },
          headers: {},
        };

        const result = yield* sendHonoResponse(response, mockContext);

        expect(result).toBeInstanceOf(Response);
        expect(result.status).toBe(400);

        const body = yield* Effect.promise(() => result.json());
        expect(body).toHaveProperty("error");
      }),
    );

    it.effect("should include custom headers", () =>
      Effect.gen(function* () {
        const mockContext = {} as unknown as Context<Env>;

        const response = {
          status: 200,
          body: { data: "test" },
          headers: {
            "X-Custom-Header": "test-value",
            "X-Request-Id": "req-123",
          },
        };

        const result = yield* sendHonoResponse(response, mockContext);

        expect(result.headers.get("X-Custom-Header")).toBe("test-value");
        expect(result.headers.get("X-Request-Id")).toBe("req-123");
      }),
    );

    it.effect("should set default Content-Type header", () =>
      Effect.gen(function* () {
        const mockContext = {} as unknown as Context<Env>;

        const response = {
          status: 200,
          body: { data: "test" },
          headers: {},
        };

        const result = yield* sendHonoResponse(response, mockContext);

        expect(result.headers.get("Content-Type")).toBe("application/json");
      }),
    );

    it.effect("should preserve existing Content-Type header", () =>
      Effect.gen(function* () {
        const mockContext = {} as unknown as Context<Env>;

        const response = {
          status: 200,
          body: { data: "test" },
          headers: {
            "Content-Type": "application/custom+json",
          },
        };

        const result = yield* sendHonoResponse(response, mockContext);

        expect(result.headers.get("Content-Type")).toBe(
          "application/custom+json",
        );
      }),
    );
  });

  describe("Adapter Creation", () => {
    it.effect("should create adapter without auth middleware", () =>
      Effect.sync(() => {
        const adapter = honoAdapter();

        expect(adapter).toHaveProperty("extractRequest");
        expect(adapter).toHaveProperty("sendResponse");
        expect(adapter).toHaveProperty("webSocketHandler");
        expect(adapter.runAuthMiddleware).toBeUndefined();
      }),
    );

    it.effect("should create adapter with auth middleware", () =>
      Effect.sync(() => {
        const authMiddleware = vi.fn(
          async (_c: Context): Promise<AuthResult> => ({
            clientId: "test-user",
          }),
        );

        const adapter = honoAdapter({ authMiddleware });

        expect(adapter).toHaveProperty("extractRequest");
        expect(adapter).toHaveProperty("sendResponse");
        expect(adapter).toHaveProperty("webSocketHandler");
        expect(adapter.runAuthMiddleware).toBeDefined();
      }),
    );

    it.effect("should execute auth middleware successfully", () =>
      Effect.gen(function* () {
        const authMiddleware = vi.fn(
          async (_c: Context): Promise<AuthResult> => ({
            clientId: "test-user",
            metadata: { role: "admin" },
          }),
        );

        const adapter = honoAdapter({ authMiddleware });

        if (adapter.runAuthMiddleware) {
          const mockContext = {
            req: { header: () => "Bearer token123" },
          } as unknown as Context;

          const result = yield* adapter.runAuthMiddleware(mockContext);

          expect(result).toEqual({
            clientId: "test-user",
            metadata: { role: "admin" },
          });
          expect(authMiddleware).toHaveBeenCalledWith(mockContext);
        }
      }),
    );

    it.effect("should handle auth middleware errors gracefully", () =>
      Effect.gen(function* () {
        const authMiddleware = vi.fn(async (_c: Context) => {
          throw new Error("Auth service unavailable");
        });

        const adapter = honoAdapter({ authMiddleware });

        if (adapter.runAuthMiddleware) {
          const mockContext = {} as unknown as Context;

          const result = yield* adapter.runAuthMiddleware(mockContext);

          expect(result).toBeNull();
        }
      }),
    );

    it.effect("should return null for failed authentication", () =>
      Effect.gen(function* () {
        const authMiddleware = vi.fn(
          async (_c: Context): Promise<AuthResult> => null,
        );

        const adapter = honoAdapter({ authMiddleware });

        if (adapter.runAuthMiddleware) {
          const mockContext = {} as unknown as Context;

          const result = yield* adapter.runAuthMiddleware(mockContext);

          expect(result).toBeNull();
        }
      }),
    );
  });

  describe("Request Transformations", () => {
    it.effect("should handle different baseUrl configurations", () =>
      Effect.gen(function* () {
        const contexts = [
          {
            context: {
              req: {
                raw: {
                  method: "GET",
                  url: "http://localhost/api/v1/api/upload/test-123",
                },
              },
            } as unknown as Context<Env>,
            baseUrl: "api/v1",
          },
          {
            context: {
              req: {
                raw: {
                  method: "GET",
                  url: "http://localhost/uploadista/api/upload/test-456",
                },
              },
            } as unknown as Context<Env>,
            baseUrl: "uploadista",
          },
        ];

        for (const { context, baseUrl } of contexts) {
          const result = yield* extractHonoRequest(context, { baseUrl });
          expect(result.type).toBe("get-upload");
        }
      }),
    );

    it.effect("should parse URL query parameters correctly", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "GET",
              url: "http://localhost/uploadista/api/upload/capabilities?storageId=s3-bucket",
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("get-capabilities");
        if (result.type === "get-capabilities") {
          expect(result.storageId).toBe("s3-bucket");
        }
      }),
    );

    it.effect("should handle complex route segments", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "POST",
              url: "http://localhost/uploadista/api/flow/image-resize-flow/my-storage-123",
              json: async () => ({
                inputs: { width: 800, height: 600 },
              }),
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("run-flow");
        if (result.type === "run-flow") {
          expect(result.flowId).toBe("image-resize-flow");
          expect(result.storageId).toBe("my-storage-123");
        }
      }),
    );
  });

  describe("Error Handling", () => {
    it.effect("should handle missing job ID in job status request", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "GET",
              url: "http://localhost/uploadista/api/jobs//status",
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("bad-request");
      }),
    );

    it.effect("should handle missing inputs in run-flow request", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "POST",
              url: "http://localhost/uploadista/api/flow/flow-123/storage-456",
              json: async () => ({}),
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("bad-request");
        if (result.type === "bad-request") {
          expect(result.message).toContain("Inputs are required");
        }
      }),
    );

    it.effect("should handle unsupported content type in resume-flow", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "PATCH",
              url: "http://localhost/uploadista/api/jobs/job-123/resume/node-456",
              headers: new Headers({ "Content-Type": "text/plain" }),
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("unsupported-content-type");
      }),
    );

    it.effect("should handle missing body in octet-stream resume", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "PATCH",
              url: "http://localhost/uploadista/api/jobs/job-123/resume/node-456",
              headers: new Headers({
                "Content-Type": "application/octet-stream",
              }),
              body: null,
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("bad-request");
        if (result.type === "bad-request") {
          expect(result.message).toContain("Missing body");
        }
      }),
    );

    it.effect("should handle missing newData in JSON resume", () =>
      Effect.gen(function* () {
        const mockContext = {
          req: {
            raw: {
              method: "PATCH",
              url: "http://localhost/uploadista/api/jobs/job-123/resume/node-456",
              headers: new Headers({ "Content-Type": "application/json" }),
              json: async () => ({ other: "data" }),
            },
          },
        } as unknown as Context<Env>;

        const result = yield* extractHonoRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("bad-request");
        if (result.type === "bad-request") {
          expect(result.message).toContain("Missing newData");
        }
      }),
    );
  });
});
