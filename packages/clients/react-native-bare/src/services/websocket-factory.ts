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

  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  private native: WebSocket;

  get readyState(): number {
    return this.native.readyState;
  }

  constructor(url: string) {
    this.native = new WebSocket(url);

    // Proxy event handlers
    this.native.onopen = () => {
      this.onopen?.();
    };

    this.native.onclose = (event) => {
      this.onclose?.({
        code: (event as CloseEvent).code ?? 1000,
        reason: (event as CloseEvent).reason ?? "",
      });
    };

    this.native.onerror = (event) => {
      this.onerror?.({
        message: (event as ErrorEvent).message ?? "WebSocket error",
      });
    };

    this.native.onmessage = (event) => {
      this.onmessage?.({
        data: (event as MessageEvent).data as string,
      });
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
