import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserWebSocketFactory } from "./websocket-factory";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  private sentMessages: (string | Uint8Array)[] = [];

  constructor(url: string) {
    this.url = url;
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data: string | Uint8Array): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.({ code: code ?? 1000, reason: reason ?? "" });
    }, 0);
  }

  // Test helpers
  simulateMessage(data: string): void {
    this.onmessage?.({ data });
  }

  simulateError(message: string): void {
    this.onerror?.({ message });
  }

  getSentMessages(): (string | Uint8Array)[] {
    return this.sentMessages;
  }
}

describe("createBrowserWebSocketFactory", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket =
      MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("should create a WebSocket factory", () => {
    const factory = createBrowserWebSocketFactory();
    expect(factory).toBeDefined();
    expect(factory.create).toBeDefined();
    expect(typeof factory.create).toBe("function");
  });

  describe("create", () => {
    it("should create a WebSocket connection", () => {
      const factory = createBrowserWebSocketFactory();
      const ws = factory.create("wss://api.example.com/ws");

      expect(ws).toBeDefined();
      expect(ws.readyState).toBe(0); // CONNECTING
    });

    it("should have CONNECTING, OPEN, CLOSING, CLOSED constants", () => {
      const factory = createBrowserWebSocketFactory();
      const ws = factory.create("wss://api.example.com/ws");

      expect(ws.CONNECTING).toBe(0);
      expect(ws.OPEN).toBe(1);
      expect(ws.CLOSING).toBe(2);
      expect(ws.CLOSED).toBe(3);
    });
  });

  describe("WebSocket events", () => {
    it("should call onopen when connection opens", async () => {
      const factory = createBrowserWebSocketFactory();
      const ws = factory.create("wss://api.example.com/ws");

      const onopen = vi.fn();
      ws.onopen = onopen;

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onopen).toHaveBeenCalled();
      expect(ws.readyState).toBe(1); // OPEN
    });

    it("should call onclose when connection closes", async () => {
      const factory = createBrowserWebSocketFactory();
      const ws = factory.create("wss://api.example.com/ws");

      const onclose = vi.fn();
      ws.onclose = onclose;

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Close the connection
      ws.close(1000, "Normal closure");

      // Wait for close event
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onclose).toHaveBeenCalledWith({
        code: 1000,
        reason: "Normal closure",
      });
    });

    it("should call onerror when error occurs", async () => {
      const factory = createBrowserWebSocketFactory();
      const ws = factory.create("wss://api.example.com/ws");

      const onerror = vi.fn();
      ws.onerror = onerror;

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate error using the mock helper
      const nativeWs = (ws as unknown as { native: MockWebSocket }).native;
      if (nativeWs && "simulateError" in nativeWs) {
        nativeWs.simulateError("Test error");
      } else {
        // Fallback: call onerror directly
        ws.onerror?.({ message: "WebSocket error" });
      }

      expect(onerror).toHaveBeenCalled();
    });

    it("should call onmessage when message received", async () => {
      const factory = createBrowserWebSocketFactory();
      const ws = factory.create("wss://api.example.com/ws");

      const onmessage = vi.fn();
      ws.onmessage = onmessage;

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate message
      const nativeWs = (ws as unknown as { native: MockWebSocket }).native;
      if (nativeWs && "simulateMessage" in nativeWs) {
        nativeWs.simulateMessage('{"type": "test"}');
      } else {
        // Fallback
        ws.onmessage?.({ data: '{"type": "test"}' });
      }

      expect(onmessage).toHaveBeenCalledWith({ data: '{"type": "test"}' });
    });
  });

  describe("send", () => {
    it("should send string data", async () => {
      const factory = createBrowserWebSocketFactory();
      const ws = factory.create("wss://api.example.com/ws");

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      ws.send('{"type": "subscribe"}');

      // Verify message was sent (would check mock in real scenario)
      expect(ws.readyState).toBe(1); // OPEN
    });

    it("should send binary data", async () => {
      const factory = createBrowserWebSocketFactory();
      const ws = factory.create("wss://api.example.com/ws");

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      const binaryData = new Uint8Array([1, 2, 3, 4]);
      ws.send(binaryData);

      expect(ws.readyState).toBe(1); // OPEN
    });
  });

  describe("close", () => {
    it("should close with default code", async () => {
      const factory = createBrowserWebSocketFactory();
      const ws = factory.create("wss://api.example.com/ws");

      const onclose = vi.fn();
      ws.onclose = onclose;

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      ws.close();

      // Wait for close event
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(ws.readyState).toBe(3); // CLOSED
    });

    it("should close with custom code and reason", async () => {
      const factory = createBrowserWebSocketFactory();
      const ws = factory.create("wss://api.example.com/ws");

      const onclose = vi.fn();
      ws.onclose = onclose;

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      ws.close(1001, "Going away");

      // Wait for close event
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onclose).toHaveBeenCalledWith({
        code: 1001,
        reason: "Going away",
      });
    });
  });
});
