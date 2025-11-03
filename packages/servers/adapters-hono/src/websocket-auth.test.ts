import type { FlowServerShape } from "@uploadista/core/flow";
import type { UploadServerShape } from "@uploadista/core/upload";
import type { AuthResult } from "@uploadista/server";
import { Effect } from "effect";
import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadistaWebSocketHandler } from "./hono-websocket-handler";

// Mock upload and flow servers
const mockUploadServer = {
  subscribeToUploadEvents: vi.fn(() => Effect.succeed(undefined)),
  unsubscribeFromUploadEvents: vi.fn(() => Effect.succeed(undefined)),
} as unknown as UploadServerShape;

const mockFlowServer = {
  subscribeToFlowEvents: vi.fn(() => Effect.succeed(undefined)),
  unsubscribeFromFlowEvents: vi.fn(() => Effect.succeed(undefined)),
} as unknown as FlowServerShape;

describe("WebSocket Authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("with auth middleware configured", () => {
    it("should reject WebSocket connection without token", async () => {
      const authMiddleware = vi.fn(
        async (): Promise<AuthResult> => ({
          clientId: "user-123",
        }),
      );

      const handler = createUploadistaWebSocketHandler(
        "/uploadista",
        mockUploadServer,
        mockFlowServer,
        authMiddleware,
      );

      // Create mock context without token
      const mockContext = {
        req: {
          url: "http://localhost/uploadista/ws/upload/upload-123",
          query: vi.fn((name: string) => {
            if (name === "uploadId") return "upload-123";
            return undefined; // No token
          }),
          param: vi.fn(() => undefined),
          header: vi.fn(() => undefined),
        },
      } as unknown as Context;

      const wsEvents = handler(mockContext);

      // Mock WebSocket
      const mockWs = {
        raw: {
          send: vi.fn(),
          close: vi.fn(),
          readyState: 1,
        } as unknown as WebSocket,
        send: vi.fn(),
        close: vi.fn(),
      };

      // Trigger onOpen
      await wsEvents.onOpen?.({} as Event, mockWs as any);

      // Should send error and close with auth code
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("Authentication required"),
      );
      expect(mockWs.close).toHaveBeenCalledWith(
        4001,
        "Authentication required",
      );

      // Auth middleware should NOT be called without token
      expect(authMiddleware).not.toHaveBeenCalled();
    });

    it("should reject WebSocket connection with invalid token", async () => {
      const authMiddleware = vi.fn(async (): Promise<AuthResult> => null);

      const handler = createUploadistaWebSocketHandler(
        "/uploadista",
        mockUploadServer,
        mockFlowServer,
        authMiddleware,
      );

      // Create mock context with invalid token
      const mockContext = {
        req: {
          url: "http://localhost/uploadista/ws/upload/upload-123?token=invalid",
          query: vi.fn((name: string) => {
            if (name === "uploadId") return "upload-123";
            if (name === "token") return "invalid";
            return undefined;
          }),
          param: vi.fn(() => undefined),
          header: vi.fn(() => undefined),
        },
      } as unknown as Context;

      const wsEvents = handler(mockContext);

      const mockWs = {
        raw: {
          send: vi.fn(),
          close: vi.fn(),
          readyState: 1,
        } as unknown as WebSocket,
        send: vi.fn(),
        close: vi.fn(),
      };

      await wsEvents.onOpen?.({} as Event, mockWs as any);

      // Should send error and close
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("Authentication failed"),
      );
      expect(mockWs.close).toHaveBeenCalledWith(4001, "Authentication failed");

      // Auth middleware should have been called
      expect(authMiddleware).toHaveBeenCalledTimes(1);
    });

    it("should accept WebSocket connection with valid token", async () => {
      const authMiddleware = vi.fn(
        async (): Promise<AuthResult> => ({ clientId: "user-123" }),
      );

      const handler = createUploadistaWebSocketHandler(
        "/uploadista",
        mockUploadServer,
        mockFlowServer,
        authMiddleware,
      );

      const mockContext = {
        req: {
          url: "http://localhost/uploadista/ws/upload/upload-123?token=valid-token",
          query: vi.fn((name: string) => {
            if (name === "uploadId") return "upload-123";
            if (name === "token") return "valid-token";
            return undefined;
          }),
          param: vi.fn(() => undefined),
          header: vi.fn(() => undefined),
        },
      } as unknown as Context;

      const wsEvents = handler(mockContext);

      const mockWs = {
        raw: {
          send: vi.fn(),
          close: vi.fn(),
          readyState: 1,
        } as unknown as WebSocket,
        send: vi.fn(),
        close: vi.fn(),
      };

      await wsEvents.onOpen?.({} as Event, mockWs as any);

      // Should NOT send error or close immediately
      expect(mockWs.close).not.toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining("Authentication"),
      );

      // Should eventually send connection message (after subscription)
      // Note: This would require more complex mocking of the Effect runtime
      // For now, we verify auth middleware was called successfully
      expect(authMiddleware).toHaveBeenCalledTimes(1);
    });

    it("should handle auth middleware errors gracefully", async () => {
      const authMiddleware = vi.fn(async () => {
        throw new Error("Auth service unavailable");
      });

      const handler = createUploadistaWebSocketHandler(
        "/uploadista",
        mockUploadServer,
        mockFlowServer,
        authMiddleware,
      );

      const mockContext = {
        req: {
          url: "http://localhost/uploadista/ws/upload/upload-123?token=valid-token",
          query: vi.fn((name: string) => {
            if (name === "uploadId") return "upload-123";
            if (name === "token") return "valid-token";
            return undefined;
          }),
          param: vi.fn(() => undefined),
          header: vi.fn(() => undefined),
        },
      } as unknown as Context;

      const wsEvents = handler(mockContext);

      const mockWs = {
        raw: {
          send: vi.fn(),
          close: vi.fn(),
          readyState: 1,
        } as unknown as WebSocket,
        send: vi.fn(),
        close: vi.fn(),
      };

      await wsEvents.onOpen?.({} as Event, mockWs as any);

      // Should send error and close
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("Authentication error"),
      );
      expect(mockWs.close).toHaveBeenCalledWith(4001, "Authentication error");
    });
  });

  describe("without auth middleware", () => {
    it("should accept WebSocket connection without authentication", async () => {
      const handler = createUploadistaWebSocketHandler(
        "/uploadista",
        mockUploadServer,
        mockFlowServer,
        // No auth middleware
      );

      const mockContext = {
        req: {
          url: "http://localhost/uploadista/ws/upload/upload-123",
          query: vi.fn((name: string) => {
            if (name === "uploadId") return "upload-123";
            return undefined;
          }),
          param: vi.fn(() => undefined),
          header: vi.fn(() => undefined),
        },
      } as unknown as Context;

      const wsEvents = handler(mockContext);

      const mockWs = {
        raw: {
          send: vi.fn(),
          close: vi.fn(),
          readyState: 1,
        } as unknown as WebSocket,
        send: vi.fn(),
        close: vi.fn(),
      };

      await wsEvents.onOpen?.({} as Event, mockWs as any);

      // Should NOT close with auth error
      expect(mockWs.close).not.toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining("Authentication"),
      );

      // Connection should proceed normally (backward compatible)
    });
  });
});
