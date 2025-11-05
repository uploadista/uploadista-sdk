import { DurableObject } from "cloudflare:workers";
import type { WebSocketConnection } from "@uploadista/core/types";

// WebSocketPair is available globally in Cloudflare Workers
declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};

/**
 * Base Durable Object implementation for Uploadista event emission.
 *
 * This class provides:
 * - Hibernatable WebSocket connections
 * - Event broadcasting to all connected clients
 * - Automatic connection management
 * - RPC methods for emit/subscribe/unsubscribe
 *
 * Extend this class in your Worker to create event emitter Durable Objects:
 *
 * @example
 * ```typescript
 * export class UploadistaDurableObject extends UploadistaDurableObjectImpl {}
 * ```
 */
export class UploadistaDurableObjectImpl extends DurableObject {
  /**
   * Handles WebSocket upgrade requests.
   * Creates a hibernatable WebSocket connection.
   */
  async fetch(request: Request): Promise<Response> {
    console.log(`[DO fetch] WebSocket connection request: ${request.url}`);

    // Creates two ends of a WebSocket connection
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept WebSocket with hibernation support
    // This allows the DO to be evicted from memory during idle periods
    this.ctx.acceptWebSocket(server);

    console.log(`[DO fetch] WebSocket accepted, total connections: ${this.ctx.getWebSockets().length}`);

    return new Response(null, {
      status: 101,
      webSocket: client as unknown,
    } as ResponseInit);
  }

  /**
   * RPC method: Emit a message to all connected WebSocket clients.
   *
   * @param message - The message to broadcast (typically a JSON string)
   */
  async emit(message: string): Promise<void> {
    const websockets = this.ctx.getWebSockets();
    console.log(`[DO emit] Broadcasting message to ${websockets.length} WebSocket(s):`, message.substring(0, 200));

    for (const ws of websockets) {
      try {
        ws.send(message);
      } catch (error) {
        console.error("Failed to send message to WebSocket:", error);
      }
    }
  }

  /**
   * RPC method: Subscribe a WebSocket connection.
   *
   * Note: This is called via RPC, the actual WebSocket connection
   * is established via the fetch() handler.
   */
  async subscribe(_connection: WebSocketConnection): Promise<void> {
    // The connection is already established via fetch()
    // This method exists for API compatibility
    return;
  }

  /**
   * RPC method: Unsubscribe from events.
   *
   * Closes all WebSocket connections for this DO instance.
   */
  async unsubscribe(): Promise<void> {
    const websockets = this.ctx.getWebSockets();
    for (const ws of websockets) {
      ws.close(1000, "Unsubscribed");
    }
  }

  /**
   * Hibernation API: Handle incoming WebSocket messages.
   *
   * Called automatically when a message arrives on a hibernated WebSocket.
   */
  async webSocketMessage(_ws: WebSocket, message: ArrayBuffer | string) {
    // Log message for debugging
    console.log(`WebSocket message received: ${message}`);
  }

  /**
   * Hibernation API: Handle WebSocket close events.
   *
   * Called automatically when a WebSocket connection closes.
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    _reason: string,
    _wasClean: boolean,
  ) {
    // Clean up the connection
    if (ws.readyState === WebSocket.OPEN) {
      // Use a valid close code instead of potentially reserved ones
      const validCloseCode =
        code === 1006 || code < 1000 || code > 4999 ? 1000 : code;
      ws.close(validCloseCode, "Durable Object closing WebSocket");
    }
  }

  /**
   * Hibernation API: Handle WebSocket errors.
   *
   * Called automatically when a WebSocket error occurs.
   */
  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1011, "WebSocket error occurred");
    }
  }
}
