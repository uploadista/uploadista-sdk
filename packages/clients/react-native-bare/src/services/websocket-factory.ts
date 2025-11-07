import type { WebSocketFactory, WebSocketLike } from "@uploadista/client-core";

/**
 * React Native WebSocket implementation that wraps native WebSocket
 * React Native provides a WebSocket API that is compatible with the browser WebSocket API
 */
class ReactNativeWebSocket implements WebSocketLike {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readonly readyState: number;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;

  private native: WebSocket;

  constructor(url: string) {
    this.native = new WebSocket(url);
    this.readyState = this.native.readyState;

    // Proxy event handlers
    this.native.onopen = (event) => {
      this.readyState = this.native.readyState;
      this.onopen?.(event);
    };

    this.native.onclose = (event) => {
      this.readyState = this.native.readyState;
      this.onclose?.(event);
    };

    this.native.onerror = (event) => {
      this.onerror?.(event);
    };

    this.native.onmessage = (event) => {
      this.onmessage?.(event);
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
 * Factory for creating React Native WebSocket connections
 */
export const createReactNativeWebSocketFactory = (): WebSocketFactory => ({
  create: (url: string): WebSocketLike => new ReactNativeWebSocket(url),
});
