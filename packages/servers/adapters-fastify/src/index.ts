// Export error types and utilities
export * from "./error-types";
// V2 API (new adapter pattern)
export * from "./fastify-adapter";
// V1 API (legacy, for backward compatibility)
export * from "./uploadista-adapter";

// Export types and utilities for WebSocket integration
export type {
  FastifyWebSocketHandler,
  WebSocketConnection,
  WebSocketHandlers,
} from "./uploadista-adapter-layer";
export {
  createUploadistaWebSocketHandler,
  createWebSocketCloseHandler,
  createWebSocketErrorHandler,
  createWebSocketMessageHandler,
} from "./uploadista-websocket-handler";
