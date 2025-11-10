/**
 * Tests for Express Adapter Integration
 *
 * Covers:
 * - HTTP request extraction from Express Request/Response
 * - Response sending via Express Response
 * - Request routing (upload, flow, jobs)
 * - HTTP method handling (GET, POST, PATCH)
 * - Error handling
 * - Auth middleware integration
 * - Request/response transformations
 */

import { Readable } from "node:stream";
import { it } from "@effect/vitest";
import type { AuthResult } from "@uploadista/server";
import { Effect } from "effect";
import type { Request, Response } from "express";
import { describe, expect, vi } from "vitest";
import { type ExpressContext, expressAdapter } from "../src/express-adapter";
import {
  extractExpressRequest,
  sendExpressResponse,
} from "../src/express-http-handler";

describe("Express Adapter Integration", () => {
  describe("Request Extraction", () => {
    it.effect("should extract create-upload request", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "POST",
          url: "/uploadista/api/upload",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
          body: {
            storageId: "test-storage",
            size: 1024,
            type: "image/jpeg",
            fileName: "test.jpg",
          },
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
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
        const mockRequest = {
          method: "GET",
          url: "/uploadista/api/upload/upload-123",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("get-upload");
        if (result.type === "get-upload") {
          expect(result.uploadId).toBe("upload-123");
        }
      }),
    );

    it.effect("should extract upload-chunk request with stream", () =>
      Effect.gen(function* () {
        const mockStream = new Readable({
          read() {
            this.push(Buffer.from("chunk data"));
            this.push(null);
          },
        });

        const mockRequest = Object.assign(mockStream, {
          method: "PATCH",
          url: "/uploadista/api/upload/upload-123",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        }) as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
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
        const mockRequest = {
          method: "GET",
          url: "/uploadista/api/upload/test-storage/capabilities?storageId=test-storage",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
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
        const mockRequest = {
          method: "POST",
          url: "/uploadista/api/flow/flow-123/storage-456",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
          body: {
            inputs: { file: "data" },
          },
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
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
        const mockRequest = {
          method: "GET",
          url: "/uploadista/api/jobs/job-123/status",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("job-status");
        if (result.type === "job-status") {
          expect(result.jobId).toBe("job-123");
        }
      }),
    );

    it.effect("should return not-found for invalid routes", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "GET",
          url: "/invalid/path",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("not-found");
      }),
    );

    it.effect("should return method-not-allowed for unsupported methods", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "DELETE",
          url: "/uploadista/api/upload/upload-123",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("method-not-allowed");
      }),
    );

    it.effect("should handle pause-flow request", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "POST",
          url: "/uploadista/api/jobs/job-123/pause",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
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
        const mockRequest = {
          method: "POST",
          url: "/uploadista/api/jobs/job-123/cancel",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("cancel-flow");
        if (result.type === "cancel-flow") {
          expect(result.jobId).toBe("job-123");
        }
      }),
    );

    it.effect("should handle resume-flow with JSON content", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "PATCH",
          url: "/uploadista/api/jobs/job-123/resume/node-456",
          get: (name: string) => {
            if (name === "host") return "localhost";
            if (name === "content-type") return "application/json";
            return undefined;
          },
          body: { newData: { result: "approved" } },
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
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
  });

  describe("Response Sending", () => {
    it.effect("should send success response", () =>
      Effect.gen(function* () {
        const mockResponse = {
          status: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          send: vi.fn().mockReturnThis(),
        } as unknown as Response;

        const mockContext: ExpressContext = {
          request: {} as Request,
          response: mockResponse,
        };

        const response = {
          status: 200,
          body: { success: true, data: { id: "upload-123" } },
          headers: {},
        };

        const result = yield* sendExpressResponse(response, mockContext);

        expect(result.status).toHaveBeenCalledWith(200);
        expect(result.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: { id: "upload-123" },
          }),
        );
      }),
    );

    it.effect("should send error response", () =>
      Effect.gen(function* () {
        const mockResponse = {
          status: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          send: vi.fn().mockReturnThis(),
        } as unknown as Response;

        const mockContext: ExpressContext = {
          request: {} as Request,
          response: mockResponse,
        };

        const response = {
          status: 400,
          body: { error: "Invalid request" },
          headers: {},
        };

        const result = yield* sendExpressResponse(response, mockContext);

        expect(result.status).toHaveBeenCalledWith(400);
        expect(result.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: "Invalid request",
          }),
        );
      }),
    );

    it.effect("should include custom headers", () =>
      Effect.gen(function* () {
        const mockResponse = {
          status: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          send: vi.fn().mockReturnThis(),
        } as unknown as Response;

        const mockContext: ExpressContext = {
          request: {} as Request,
          response: mockResponse,
        };

        const response = {
          status: 200,
          body: { data: "test" },
          headers: {
            "X-Custom-Header": "test-value",
            "X-Request-Id": "req-123",
          },
        };

        const result = yield* sendExpressResponse(response, mockContext);

        expect(result.set).toHaveBeenCalledWith(
          "X-Custom-Header",
          "test-value",
        );
        expect(result.set).toHaveBeenCalledWith("X-Request-Id", "req-123");
      }),
    );

    it.effect("should set default Content-Type header", () =>
      Effect.gen(function* () {
        const mockResponse = {
          status: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          send: vi.fn().mockReturnThis(),
        } as unknown as Response;

        const mockContext: ExpressContext = {
          request: {} as Request,
          response: mockResponse,
        };

        const response = {
          status: 200,
          body: { data: "test" },
          headers: {},
        };

        const result = yield* sendExpressResponse(response, mockContext);

        expect(result.set).toHaveBeenCalledWith(
          "Content-Type",
          "application/json",
        );
      }),
    );

    it.effect("should preserve existing Content-Type header", () =>
      Effect.gen(function* () {
        const mockResponse = {
          status: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          send: vi.fn().mockReturnThis(),
        } as unknown as Response;

        const mockContext: ExpressContext = {
          request: {} as Request,
          response: mockResponse,
        };

        const response = {
          status: 200,
          body: { data: "test" },
          headers: {
            "Content-Type": "application/custom+json",
          },
        };

        const result = yield* sendExpressResponse(response, mockContext);

        expect(result.set).toHaveBeenCalledWith(
          "Content-Type",
          "application/custom+json",
        );
      }),
    );
  });

  describe("Adapter Creation", () => {
    it.effect("should create adapter without auth middleware", () =>
      Effect.sync(() => {
        const adapter = expressAdapter();

        expect(adapter).toHaveProperty("extractRequest");
        expect(adapter).toHaveProperty("sendResponse");
        expect(adapter).toHaveProperty("webSocketHandler");
        expect(adapter.runAuthMiddleware).toBeUndefined();
      }),
    );

    it.effect("should create adapter with auth middleware", () =>
      Effect.sync(() => {
        const authMiddleware = vi.fn(
          async (_ctx: ExpressContext): Promise<AuthResult> => ({
            clientId: "test-user",
          }),
        );

        const adapter = expressAdapter({ authMiddleware });

        expect(adapter).toHaveProperty("extractRequest");
        expect(adapter).toHaveProperty("sendResponse");
        expect(adapter).toHaveProperty("webSocketHandler");
        expect(adapter.runAuthMiddleware).toBeDefined();
      }),
    );

    it.effect("should execute auth middleware successfully", () =>
      Effect.gen(function* () {
        const authMiddleware = vi.fn(
          async (_ctx: ExpressContext): Promise<AuthResult> => ({
            clientId: "test-user",
            metadata: { role: "admin" },
          }),
        );

        const adapter = expressAdapter({ authMiddleware });

        if (adapter.runAuthMiddleware) {
          const mockContext: ExpressContext = {
            request: {
              get: () => "Bearer token123",
            } as unknown as Request,
            response: {} as Response,
          };

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
        const authMiddleware = vi.fn(async (_ctx: ExpressContext) => {
          throw new Error("Auth service unavailable");
        });

        const adapter = expressAdapter({ authMiddleware });

        if (adapter.runAuthMiddleware) {
          const mockContext: ExpressContext = {
            request: {} as Request,
            response: {} as Response,
          };

          const result = yield* adapter.runAuthMiddleware(mockContext);

          expect(result).toBeNull();
        }
      }),
    );

    it.effect("should return null for failed authentication", () =>
      Effect.gen(function* () {
        const authMiddleware = vi.fn(
          async (_ctx: ExpressContext): Promise<AuthResult> => null,
        );

        const adapter = expressAdapter({ authMiddleware });

        if (adapter.runAuthMiddleware) {
          const mockContext: ExpressContext = {
            request: {} as Request,
            response: {} as Response,
          };

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
              request: {
                method: "GET",
                url: "/api/v1/api/upload/test-123",
                get: (name: string) =>
                  name === "host" ? "localhost" : undefined,
              } as unknown as Request,
              response: {} as Response,
            } as ExpressContext,
            baseUrl: "api/v1",
          },
          {
            context: {
              request: {
                method: "GET",
                url: "/uploadista/api/upload/test-456",
                get: (name: string) =>
                  name === "host" ? "localhost" : undefined,
              } as unknown as Request,
              response: {} as Response,
            } as ExpressContext,
            baseUrl: "uploadista",
          },
        ];

        for (const { context, baseUrl } of contexts) {
          const result = yield* extractExpressRequest(context, {
            baseUrl,
          });
          expect(result.type).toBe("get-upload");
        }
      }),
    );

    it.effect("should parse URL query parameters correctly", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "GET",
          url: "/uploadista/api/upload/capabilities?storageId=s3-bucket",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
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
        const mockRequest = {
          method: "POST",
          url: "/uploadista/api/flow/image-resize-flow/my-storage-123",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
          body: {
            inputs: { width: 800, height: 600 },
          },
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("run-flow");
        if (result.type === "run-flow") {
          expect(result.flowId).toBe("image-resize-flow");
          expect(result.storageId).toBe("my-storage-123");
        }
      }),
    );

    it.effect("should handle JSON body parsing", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "POST",
          url: "/uploadista/api/upload",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
          body: {
            storageId: "test-storage",
            fileName: "document.pdf",
            size: 2048,
            type: "application/pdf",
          },
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("create-upload");
        if (result.type === "create-upload") {
          expect((result.data as { fileName: string }).fileName).toBe(
            "document.pdf",
          );
          expect((result.data as { size: number }).size).toBe(2048);
        }
      }),
    );
  });

  describe("Error Handling", () => {
    it.effect("should handle missing upload ID", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "GET",
          url: "/uploadista/api/upload",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("bad-request");
      }),
    );

    it.effect("should handle missing storage ID in capabilities", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "GET",
          url: "/uploadista/api/upload/capabilities",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("bad-request");
        if (result.type === "bad-request") {
          expect(result.message).toContain("Storage ID is required");
        }
      }),
    );

    it.effect("should handle missing inputs in run-flow", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "POST",
          url: "/uploadista/api/flow/flow-123/storage-456",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
          body: {},
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("bad-request");
        if (result.type === "bad-request") {
          expect(result.message).toContain("Inputs are required");
        }
      }),
    );

    it.effect("should handle missing job ID in job-status", () =>
      Effect.gen(function* () {
        const mockRequest = {
          method: "GET",
          url: "/uploadista/api/jobs//status",
          get: (name: string) => (name === "host" ? "localhost" : undefined),
        } as unknown as Request;

        const mockContext: ExpressContext = {
          request: mockRequest,
          response: {} as Response,
        };

        const result = yield* extractExpressRequest(mockContext, {
          baseUrl: "uploadista",
        });

        expect(result.type).toBe("bad-request");
      }),
    );
  });

  describe("WebSocket Handler", () => {
    it.effect("should create WebSocket handler", () =>
      Effect.sync(() => {
        const adapter = expressAdapter();

        const wsHandler = adapter.webSocketHandler({
          baseUrl: "/uploadista",
        });

        expect(wsHandler).toBeDefined();
      }),
    );

    it.effect("should create WebSocket handler with auth middleware", () =>
      Effect.sync(() => {
        const authMiddleware = vi.fn(
          async (_ctx: ExpressContext): Promise<AuthResult> => ({
            clientId: "test-user",
          }),
        );

        const adapter = expressAdapter({ authMiddleware });

        const wsHandler = adapter.webSocketHandler({
          baseUrl: "/uploadista",
        });

        expect(wsHandler).toBeDefined();
      }),
    );
  });
});
