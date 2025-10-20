import type { DurableObjectNamespace, Rpc } from "@cloudflare/workers-types";
import type { WebSocketConnection } from "@uploadista/core/types";

export type EventEmitterDurableObjectBranded<T> = Rpc.DurableObjectBranded & {
  emit: (event: T) => Promise<void>;
  subscribe: (connection: WebSocketConnection) => Promise<void>;
  unsubscribe: () => Promise<void>;
};

// Durable Object
export type EventEmitterDurableObject<T> = DurableObjectNamespace<
  EventEmitterDurableObjectBranded<T>
>;
