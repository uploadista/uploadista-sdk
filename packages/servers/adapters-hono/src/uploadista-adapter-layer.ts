import { Context, type Effect } from "effect";
import type { Context as HonoContext } from "hono";
import type { WSEvents } from "hono/ws";

// Define the Uploadista adapter service interface
export type HonoUploadistaAdapterServiceShape = {
  handler: (c: HonoContext) => Effect.Effect<Response, never, never>;
  websocketHandler: (c: HonoContext) => WSEvents;
  durableObjectWebSocketHandler?: (c: HonoContext) => Promise<Response>;
};

// Context Tag for the Uploadista adapter service
export class HonoUploadistaAdapterService extends Context.Tag(
  "HonoUploadistaAdapterService",
)<HonoUploadistaAdapterService, HonoUploadistaAdapterServiceShape>() {}
