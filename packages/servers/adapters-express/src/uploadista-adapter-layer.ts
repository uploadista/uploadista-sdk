import type { IncomingMessage } from "node:http";
import { type Effect, Context as EffectContext } from "effect";
import type { Request, Response } from "express";

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

export type ExpressWebSocketHandler = (
  req: IncomingMessage,
  connection: WebSocketConnection,
) => WebSocketHandlers;

// Define the Uploadista adapter service interface
export type ExpressUploadistaAdapterServiceShape = {
  handler: (req: Request, res: Response) => Effect.Effect<void, never, never>;
  websocketHandler: ExpressWebSocketHandler;
};

// Context Tag for the Uploadista adapter service
export class ExpressUploadistaAdapterService extends EffectContext.Tag(
  "ExpressUploadistaAdapterService",
)<ExpressUploadistaAdapterService, ExpressUploadistaAdapterServiceShape>() {}
