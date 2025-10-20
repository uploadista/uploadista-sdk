import type { WebSocketFactory, WebSocketLike } from "@uploadista/client-core";

/**
 * Browser WebSocket implementation that wraps native WebSocket
 */
class BrowserWebSocket implements WebSocketLike {
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
      const closeEvent = event as CloseEvent;
      this.onclose?.({ code: closeEvent.code, reason: closeEvent.reason });
    };

    this.native.onerror = (_event) => {
      this.onerror?.({ message: "WebSocket error" });
    };

    this.native.onmessage = (event) => {
      const messageEvent = event as MessageEvent;
      this.onmessage?.({ data: messageEvent.data });
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
 * Factory for creating browser WebSocket connections
 */
export const createBrowserWebSocketFactory = (): WebSocketFactory => ({
  create: (url: string): WebSocketLike => new BrowserWebSocket(url),
});
