import { UploadistaError } from "@uploadista/core/errors";
import type { WebSocketConnection } from "@uploadista/core/types";
import {
  type BaseEventEmitter,
  BaseEventEmitterService,
} from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import type { EventEmitterDurableObject } from "./event-emitter-durable-object";

export type DurableObjectEventEmitterConfig = {
  durableObject: EventEmitterDurableObject<string>;
};

/**
 * Creates a BaseEventEmitter implementation using Cloudflare Durable Objects.
 *
 * This implementation:
 * - Routes events to Durable Object instances by eventKey
 * - Each eventKey gets its own DO instance
 * - WebSocket connections are managed by the DO
 * - No external broadcaster needed - DO is single source of truth
 *
 * @param config - Configuration with Durable Object namespace
 * @returns BaseEventEmitter implementation
 */
export function durableObjectBaseEventEmitter({
  durableObject,
}: DurableObjectEventEmitterConfig): BaseEventEmitter {
  function getStub(eventKey: string) {
    const id = durableObject.idFromName(eventKey);
    return durableObject.get(id);
  }

  return {
    emit: (eventKey: string, message: string) => {
      return Effect.tryPromise({
        try: async () => {
          console.log(`[DO EventEmitter] Emitting to eventKey: ${eventKey}`, message.substring(0, 200));
          const stub = getStub(eventKey);
          // Call the emit RPC method on the Durable Object
          await (stub as any).emit(message);
          console.log(`[DO EventEmitter] Successfully emitted to eventKey: ${eventKey}`);
        },
        catch: (cause) => {
          console.error(`[DO EventEmitter] Failed to emit to eventKey: ${eventKey}`, cause);
          return UploadistaError.fromCode("UNKNOWN_ERROR", { cause });
        },
      });
    },
    subscribe: (eventKey: string, connection: WebSocketConnection) => {
      return Effect.tryPromise({
        try: async () => {
          const stub = getStub(eventKey);
          // Call the subscribe RPC method on the Durable Object
          await (stub as any).subscribe(connection);
        },
        catch: (cause) => {
          return UploadistaError.fromCode("UNKNOWN_ERROR", { cause });
        },
      });
    },
    unsubscribe: (eventKey: string) => {
      return Effect.tryPromise({
        try: async () => {
          const stub = getStub(eventKey);
          // Call the unsubscribe RPC method on the Durable Object
          await (stub as any).unsubscribe();
        },
        catch: (cause) => {
          return UploadistaError.fromCode("UNKNOWN_ERROR", { cause });
        },
      });
    },
  };
}

/**
 * Creates a Layer for BaseEventEmitterService using Durable Objects.
 *
 * Use this when creating an Uploadista server with Durable Objects:
 *
 * @example
 * ```typescript
 * const server = await createUploadistaServer({
 *   eventEmitter: durableObjectEventEmitter({
 *     durableObject: env.UPLOADISTA_DO,
 *   }),
 *   // ... other config
 * });
 * ```
 */
export const durableObjectEventEmitter = (
  config: DurableObjectEventEmitterConfig,
) =>
  Layer.succeed(
    BaseEventEmitterService,
    durableObjectBaseEventEmitter(config),
  );
