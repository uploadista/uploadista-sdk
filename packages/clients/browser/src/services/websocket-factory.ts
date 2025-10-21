import type { WebSocketFactory, WebSocketLike } from "@uploadista/client-core";

/**
 * Browser implementation of WebSocket that wraps the native WebSocket API.
 *
 * This class provides a minimal wrapper around the browser's native WebSocket
 * to ensure compatibility with the Uploadista client's WebSocketLike interface.
 * It's used for real-time communication features like:
 * - Upload progress streaming
 * - Flow execution status updates
 * - Real-time error notifications
 * - Live event feeds
 *
 * The wrapper preserves all WebSocket states and properly proxies all events
 * while maintaining the standard WebSocket lifecycle.
 *
 * @example
 * ```typescript
 * const ws = new BrowserWebSocket('wss://api.example.com/ws');
 *
 * ws.onopen = () => {
 *   console.log('Connected');
 *   ws.send('Hello server');
 * };
 *
 * ws.onmessage = (event) => {
 *   console.log('Message:', event.data);
 * };
 *
 * ws.onerror = (event) => {
 *   console.error('Error:', event.message);
 * };
 *
 * ws.onclose = (event) => {
 *   console.log('Closed:', event.code, event.reason);
 * };
 * ```
 */
class BrowserWebSocket implements WebSocketLike {
  /** WebSocket is currently connecting (readyState = 0) */
  readonly CONNECTING = 0;
  /** WebSocket connection is open and ready (readyState = 1) */
  readonly OPEN = 1;
  /** WebSocket is closing (readyState = 2) */
  readonly CLOSING = 2;
  /** WebSocket connection is closed (readyState = 3) */
  readonly CLOSED = 3;

  /**
   * Current state of the WebSocket connection.
   *
   * Possible values:
   * - 0 (CONNECTING): Connection is being established
   * - 1 (OPEN): Connection is open and ready for communication
   * - 2 (CLOSING): Connection is closing
   * - 3 (CLOSED): Connection is closed or couldn't be opened
   */
  readyState: number;

  /** Event handler called when the connection is established */
  onopen: (() => void) | null = null;

  /** Event handler called when the connection is closed */
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  /** Event handler called when an error occurs */
  onerror: ((event: { message: string }) => void) | null = null;

  /** Event handler called when a message is received */
  onmessage: ((event: { data: string }) => void) | null = null;

  private native: WebSocket;

  /**
   * Creates a new BrowserWebSocket instance.
   *
   * Initializes a native WebSocket connection to the specified URL and sets up
   * event handler proxying to convert native events to the WebSocketLike format.
   *
   * @param url - WebSocket URL to connect to (must use ws:// or wss:// protocol)
   *
   * @example
   * ```typescript
   * const ws = new BrowserWebSocket('wss://api.example.com/upload/progress');
   * ```
   */
  constructor(url: string) {
    this.native = new WebSocket(url);
    this.readyState = this.native.readyState;

    // Proxy event handlers to convert native events to WebSocketLike format
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

  /**
   * Sends data through the WebSocket connection.
   *
   * The data can be either a string (text message) or a Uint8Array (binary message).
   * The connection must be in the OPEN state before sending data.
   *
   * @param data - String or binary data to send
   *
   * @throws {Error} If the connection is not open
   *
   * @example
   * ```typescript
   * // Send text message
   * ws.send('{"type": "subscribe", "channel": "uploads"}');
   *
   * // Send binary data
   * const buffer = new Uint8Array([1, 2, 3, 4]);
   * ws.send(buffer);
   * ```
   */
  send(data: string | Uint8Array): void {
    this.native.send(data);
  }

  /**
   * Closes the WebSocket connection.
   *
   * Optionally accepts a close code and reason that will be sent to the server.
   * Standard close codes include:
   * - 1000: Normal closure
   * - 1001: Going away (e.g., page navigation)
   * - 1002: Protocol error
   * - 1003: Unsupported data
   *
   * @param code - Optional close code (default: 1000 for normal closure)
   * @param reason - Optional human-readable reason for closing
   *
   * @example
   * ```typescript
   * // Normal close
   * ws.close();
   *
   * // Close with reason
   * ws.close(1000, 'Upload completed');
   *
   * // Close due to error
   * ws.close(1011, 'Internal error during upload');
   * ```
   */
  close(code?: number, reason?: string): void {
    this.native.close(code, reason);
  }
}

/**
 * Creates a factory for browser WebSocket connections.
 *
 * This factory is used by the Uploadista client to create WebSocket connections
 * for real-time features. It wraps the browser's native WebSocket API and provides
 * a consistent interface for the client.
 *
 * The factory creates WebSockets that support:
 * - Real-time upload progress updates
 * - Flow execution status streaming
 * - Live error and event notifications
 * - Bidirectional client-server communication
 *
 * @returns A WebSocketFactory that creates browser-compatible WebSocket connections
 *
 * @example
 * ```typescript
 * import { createBrowserWebSocketFactory } from '@uploadista/client-browser';
 *
 * const factory = createBrowserWebSocketFactory();
 *
 * // Create a WebSocket connection
 * const ws = factory.create('wss://api.example.com/ws/upload/123');
 *
 * // Set up event handlers
 * ws.onmessage = (event) => {
 *   const data = JSON.parse(event.data);
 *   if (data.type === 'progress') {
 *     console.log('Upload progress:', data.progress);
 *   }
 * };
 *
 * ws.onopen = () => {
 *   console.log('WebSocket connected');
 * };
 *
 * ws.onclose = (event) => {
 *   console.log('WebSocket closed:', event.code, event.reason);
 * };
 * ```
 *
 * @see {@link BrowserWebSocket} for the WebSocket implementation details
 */
export const createBrowserWebSocketFactory = (): WebSocketFactory => ({
  create: (url: string): WebSocketLike => new BrowserWebSocket(url),
});
