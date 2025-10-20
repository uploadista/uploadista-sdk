import type * as fastifyWebsocket from "@fastify/websocket";
import { type Effect, Context as EffectContext } from "effect";
import type { FastifyReply, FastifyRequest } from "fastify";

type WebSocket = fastifyWebsocket.WebSocket;

export interface WebSocketConnection {
  id: string;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  readyState: number;
}

export type WebSocketHandlers = {
  onMessage: (message: string) => void;
  onClose: () => void;
  onError: (error: Error) => void;
};

export type FastifyWebSocketHandler = (
  socket: WebSocket,
  request: FastifyRequest,
) => void;

// Define the Uploadista adapter service interface
export type FastifyUploadistaAdapterServiceShape = {
  handler: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Effect.Effect<void, never, never>;
  websocketHandler: FastifyWebSocketHandler;
};

// Context Tag for the Uploadista adapter service
export class FastifyUploadistaAdapterService extends EffectContext.Tag(
  "FastifyUploadistaAdapterService",
)<FastifyUploadistaAdapterService, FastifyUploadistaAdapterServiceShape>() {}
