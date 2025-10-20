import z from "zod";
import { uploadEventSchema } from "./upload-event";

/**
 * Platform-agnostic WebSocket connection interface
 */
export interface WebSocketConnection {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  readonly id: string;
}

/**
 * WebSocket message that can be sent/received
 */

export const webSocketMessageSchema = z.union([
  z.object({
    type: z.literal("upload_event"),
    payload: uploadEventSchema,
    timestamp: z.string().optional(),
  }),
  z.object({
    type: z.literal("flow_event"),
    payload: z.any(), // FlowEvent doesn't have a zod schema, using z.any() for now
    timestamp: z.string().optional(),
  }),
  z.object({
    type: z.literal("subscribed"),
    payload: z.object({ eventKey: z.string() }),
    timestamp: z.string().optional(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal("pong"),
    timestamp: z.string().optional(),
  }),
  z.object({
    type: z.literal("ping"),
    timestamp: z.string().optional(),
  }),
  z.object({
    type: z.literal("connection"),
    message: z.string().optional(),
    uploadId: z.string().optional(),
    timestamp: z.string().optional(),
  }),
]);

export type WebSocketMessage<TEvent = unknown> =
  | z.infer<typeof webSocketMessageSchema>
  | {
      type: "upload_event";
      payload: TEvent;
      timestamp?: string;
    }
  | {
      type: "flow_event";
      payload: TEvent;
      timestamp?: string;
    };
