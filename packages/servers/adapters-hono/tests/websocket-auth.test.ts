import { FlowServer, type FlowServerShape } from "@uploadista/core/flow";
import { UploadServer, type UploadServerShape } from "@uploadista/core/upload";
import type { AuthResult } from "@uploadista/server";
import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { honoWebSocketHandler } from "./hono-websocket-handler";

// Mock upload and flow servers
const mockUploadServer = {
  subscribeToUploadEvents: vi.fn(() => Effect.succeed(undefined)),
  unsubscribeFromUploadEvents: vi.fn(() => Effect.succeed(undefined)),
} as unknown as UploadServerShape;

const mockFlowServer = {
  subscribeToFlowEvents: vi.fn(() => Effect.succeed(undefined)),
  unsubscribeFromFlowEvents: vi.fn(() => Effect.succeed(undefined)),
} as unknown as FlowServerShape;

const serverLayer = Layer.mergeAll(
  Layer.succeed(UploadServer, mockUploadServer),
  Layer.succeed(FlowServer, mockFlowServer),
);

describe("WebSocket Authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("with auth middleware configured", () => {
    it("should reject WebSocket connection without token", async () => {
      // Auth middleware that rejects when no token (simulating cookie auth failure)
      const authMiddleware = vi.fn(
        async (): Promise<AuthResult> => null, // Return null to simulate auth failure
      );

      const handler = honoWebSocketHandler("/uploadista", authMiddleware).pipe(
        Effect.provide(serverLayer),
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

      const wsHandler = await Effect.runPromise(handler);
      const wsEvents = wsHandler(mockContext);

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
      // When no token is present, it tries cookie-based auth
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining(
          "Authentication failed: invalid or expired cookies",
        ),
      );
      expect(mockWs.close).toHaveBeenCalledWith(
        4001,
        "Authentication failed: invalid or expired cookies",
      );

      // Auth middleware SHOULD be called (cookie-based auth fallback)
      expect(authMiddleware).toHaveBeenCalled();
    });

    it("should reject WebSocket connection with invalid token", async () => {
      const authMiddleware = vi.fn(async (): Promise<AuthResult> => null);

      const handler = honoWebSocketHandler("/uploadista", authMiddleware).pipe(
        Effect.provide(serverLayer),
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

      const wsHandler = await Effect.runPromise(handler);
      const wsEvents = wsHandler(mockContext);

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
      expect(mockWs.close).toHaveBeenCalledWith(
        4001,
        "Authentication failed: invalid or expired token",
      );

      // Auth middleware should have been called
      expect(authMiddleware).toHaveBeenCalledTimes(1);
    });

    it("should accept WebSocket connection with valid token", async () => {
      const authMiddleware = vi.fn(
        async (): Promise<AuthResult> => ({ clientId: "user-123" }),
      );

      const handler = honoWebSocketHandler("/uploadista", authMiddleware).pipe(
        Effect.provide(serverLayer),
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

      const wsHandler = await Effect.runPromise(handler);
      const wsEvents = wsHandler(mockContext);

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

      const handler = honoWebSocketHandler("/uploadista", authMiddleware).pipe(
        Effect.provide(serverLayer),
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

      const wsHandler = await Effect.runPromise(handler);
      const wsEvents = wsHandler(mockContext);

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
      const handler = honoWebSocketHandler(
        "/uploadista",
        // No auth middleware
      ).pipe(Effect.provide(serverLayer));

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

      const wsHandler = await Effect.runPromise(handler);
      const wsEvents = wsHandler(mockContext);

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
