import type { WebSocketFactory, WebSocketLike } from "@uploadista/client-core";

/**
 * Expo WebSocket implementation that wraps native WebSocket
 * Expo provides a WebSocket API that is compatible with the browser WebSocket API
 */
class ExpoWebSocket implements WebSocketLike {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState: number;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  private native: WebSocket;

  constructor(url: string) {
    this.native = new WebSocket(url);
    this.readyState = this.native.readyState;

    // Proxy event handlers
    this.native.onopen = () => {
      this.readyState = this.native.readyState;
      this.onopen?.();
    };

    this.native.onclose = (event) => {
      this.readyState = this.native.readyState;
      this.onclose?.({
        code: event.code ?? 1000,
        reason: event.reason ?? "undefined reason",
      });
    };

    this.native.onerror = (event) => {
      this.onerror?.(event);
    };

    this.native.onmessage = (event) => {
      this.onmessage?.({ data: event.data });
    };
  }

  send(data: string | Uint8Array): void {
    this.native.send(data);
  }

  close(code?: number, reason?: string): void {
    this.native.close(code, reason);
  }
}

/**
 * Factory for creating Expo WebSocket connections
 */
export const createExpoWebSocketFactory = (): WebSocketFactory => ({
  create: (url: string): WebSocketLike => new ExpoWebSocket(url),
});
