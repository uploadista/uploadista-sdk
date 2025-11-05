import type { DurableObjectNamespace, Rpc } from "@cloudflare/workers-types";
import type { WebSocketConnection } from "@uploadista/core/types";

/**
 * RPC interface for event emitter Durable Objects.
 *
 * Defines the methods that can be called on a Durable Object instance via RPC.
 */
export type EventEmitterDurableObjectBranded<T> = Rpc.DurableObjectBranded & {
  /**
   * Emit a message to all connected WebSocket clients.
   * @param message - The message to broadcast (typically a JSON string)
   */
  emit: (message: T) => Promise<void>;

  /**
   * Subscribe a WebSocket connection to this DO instance.
   * Note: The actual WebSocket connection is established via fetch()
   * @param connection - WebSocket connection details
   */
  subscribe: (connection: WebSocketConnection) => Promise<void>;

  /**
   * Unsubscribe from events by closing all WebSocket connections.
   */
  unsubscribe: () => Promise<void>;
};

/**
 * Durable Object namespace type for event emitters.
 *
 * @template T - Type of messages (typically string for JSON messages)
 */
export type EventEmitterDurableObject<T> = DurableObjectNamespace<
  EventEmitterDurableObjectBranded<T>
>;
