import type { UploadEvent } from "@uploadista/core";

/**
 * Framework-agnostic WebSocket connection interface
 * Adapters should wrap their native WebSocket implementations to match this interface
 */
export type WebSocketConnection = {
  id: string;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  readyState: number;
};

/**
 * WebSocket event types for real-time communication
 */
export type WebSocketEventType =
  | "subscribe-upload"
  | "subscribe-flow"
  | "unsubscribe-upload"
  | "unsubscribe-flow"
  | "ping"
  | "connection"
  | "upload-event"
  | "flow-event"
  | "error"
  | "invalid-path"
  | "auth-failed";

/**
 * Base WebSocket event structure
 */
export type WebSocketEvent<T extends WebSocketEventType> = {
  type: T;
};

/**
 * Incoming WebSocket messages (client -> server)
 */

export type SubscribeUploadEvent = WebSocketEvent<"subscribe-upload"> & {
  uploadId: string;
};

export type SubscribeFlowEvent = WebSocketEvent<"subscribe-flow"> & {
  jobId: string;
};

export type UnsubscribeUploadEvent = WebSocketEvent<"unsubscribe-upload"> & {
  uploadId: string;
};

export type UnsubscribeFlowEvent = WebSocketEvent<"unsubscribe-flow"> & {
  jobId: string;
};

export type PingEvent = WebSocketEvent<"ping">;

export type WebSocketIncomingEvent =
  | SubscribeUploadEvent
  | SubscribeFlowEvent
  | UnsubscribeUploadEvent
  | UnsubscribeFlowEvent
  | PingEvent;

/**
 * Outgoing WebSocket messages (server -> client)
 */

export type ConnectionEvent = WebSocketEvent<"connection"> & {
  message: string;
  id?: string;
  jobId?: string;
  uploadId?: string;
  timestamp: string;
};

export type UploadEventMessage = WebSocketEvent<"upload-event"> & {
  uploadId: string;
  event: UploadEvent;
  timestamp: string;
};

export type FlowEventMessage = WebSocketEvent<"flow-event"> & {
  jobId: string;
  event: unknown;
  timestamp: string;
};

export type ErrorEvent = WebSocketEvent<"error"> & {
  message: string;
  code?: string;
};

export type InvalidPathEvent = WebSocketEvent<"invalid-path"> & {
  message: string;
  expectedPrefix: string;
};

export type AuthFailedEvent = WebSocketEvent<"auth-failed"> & {
  message: string;
  authMethod: "token" | "cookies";
};

export type WebSocketOutgoingEvent =
  | ConnectionEvent
  | UploadEventMessage
  | FlowEventMessage
  | ErrorEvent
  | InvalidPathEvent
  | AuthFailedEvent;

/**
 * WebSocket connection request with routing information
 * Extracted from the WebSocket URL and query parameters
 */
export type WebSocketConnectionRequest = {
  /** Base URL prefix for WebSocket connections */
  baseUrl: string;
  /** Full pathname from the URL */
  pathname: string;
  /** Parsed route segments after baseUrl/ws/ */
  routeSegments: string[];
  /** Whether this is an upload route */
  isUploadRoute: boolean;
  /** Whether this is a flow route */
  isFlowRoute: boolean;
  /** Job ID (for flows) */
  jobId?: string;
  /** Upload ID (for uploads) */
  uploadId?: string;
  /** Event ID (jobId or uploadId) */
  eventId?: string;
  /** WebSocket connection instance */
  connection: WebSocketConnection;
};
