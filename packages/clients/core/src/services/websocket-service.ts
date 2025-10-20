/**
 * Platform-agnostic WebSocket interface
 */

export interface WebSocketEventMap {
  open: unknown;
  close: unknown;
  error: unknown;
  message: unknown;
}

export interface WebSocketLike {
  readyState: number;
  readonly CONNECTING: number;
  readonly OPEN: number;
  readonly CLOSING: number;
  readonly CLOSED: number;

  onopen: (() => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: { message: string }) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;

  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
}

export interface WebSocketFactory {
  /**
   * Create a WebSocket connection to the given URL
   */
  create(url: string): WebSocketLike;
}
