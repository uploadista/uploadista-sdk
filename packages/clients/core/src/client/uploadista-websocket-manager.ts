import type { FlowEvent } from "@uploadista/core/flow";
import type { UploadEvent } from "@uploadista/core/types";
import { webSocketMessageSchema } from "@uploadista/core/types";
import type { Logger } from "../logger";
import type { WebSocketLike } from "../services/websocket-service";
import type { UploadistaApi } from "./uploadista-api";

export type UploadistaEvent = UploadEvent | FlowEvent;

export type UploadistaWebSocketEventHandler = (event: UploadistaEvent) => void;

export type UploadistaWebSocketMessage =
  | { type: "connection"; message: string; id: string; timestamp: string }
  | {
      type: "subscribed";
      payload: { uploadId?: string; jobId?: string };
      timestamp: string;
    }
  | { type: "error"; message: string; code?: string }
  | { type: "pong"; timestamp: string }
  | { type: "upload_event"; payload: UploadEvent }
  | { type: "flow_event"; payload: FlowEvent };

/**
 * Unified WebSocket management for both upload and flow events
 */
export class UploadistaWebSocketManager {
  private uploadWebsockets = new Map<string, WebSocketLike>();
  private flowWebsockets = new Map<string, WebSocketLike>();

  constructor(
    private uploadistaApi: UploadistaApi,
    private logger: Logger,
    private onEvent?: UploadistaWebSocketEventHandler,
  ) {}

  /**
   * Open a WebSocket connection for upload events
   */
  async openUploadWebSocket(uploadId: string): Promise<WebSocketLike> {
    // Close existing connection if any
    this.closeUploadWebSocket(uploadId);

    const ws = await this.uploadistaApi.openUploadWebSocket(uploadId);
    this.uploadWebsockets.set(uploadId, ws);

    ws.onmessage = (event) => {
      try {
        const parsedEvent = webSocketMessageSchema.safeParse(
          JSON.parse(event.data),
        );

        if (parsedEvent.success) {
          if (parsedEvent.data.type === "upload_event") {
            this.onEvent?.(parsedEvent.data.payload);
          }
        } else {
          this.logger.error(
            `Error parsing upload event: ${parsedEvent.error.message}`,
          );
        }
      } catch (error) {
        this.logger.error(`Error parsing upload event: ${error}`);
      }
    };

    ws.onerror = (error) => {
      this.logger.error(`Upload WebSocket error for ${uploadId}: ${error}`);
    };

    ws.onclose = (event) => {
      this.logger.log(
        `Upload WebSocket closed for ${uploadId}, \n code: ${event.code as number}, reason: ${event.reason as string}`,
      );
      this.uploadWebsockets.delete(uploadId);
    };

    return ws;
  }

  /**
   * Open a WebSocket connection for flow/job events
   */
  async openFlowWebSocket(jobId: string): Promise<WebSocketLike> {
    // Close existing connection if any
    this.closeFlowWebSocket(jobId);

    const ws = await this.uploadistaApi.openFlowWebSocket(jobId);
    this.flowWebsockets.set(jobId, ws);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as UploadistaWebSocketMessage;

        switch (message.type) {
          case "connection":
            this.logger.log(`Flow WebSocket connected for job: ${message.id}`);
            break;
          case "subscribed":
            this.logger.log(
              `Flow WebSocket subscribed for job: ${message.payload.jobId}`,
            );
            break;
          case "error":
            this.logger.error(
              `Flow WebSocket error: ${message.message} for job ${jobId} with code ${message.code}`,
            );
            break;
          case "pong":
            this.logger.log(`Flow WebSocket pong received for job: ${jobId}`);
            break;
          case "flow_event":
            this.onEvent?.(message.payload);
            break;
          default:
            this.logger.warn(
              `Unknown flow WebSocket message type: ${message.type}`,
            );
        }
      } catch (error) {
        this.logger.error(`Error parsing flow WebSocket message:${error}`);
      }
    };

    ws.onerror = (error) => {
      this.logger.error(`Flow WebSocket error for job ${jobId}: ${error}`);
    };

    ws.onclose = (event) => {
      this.logger.log(
        `Flow WebSocket closed for job ${jobId}, \n code: ${event.code as number}, reason: ${event.reason as string}`,
      );
      this.flowWebsockets.delete(jobId);
    };

    return ws;
  }

  /**
   * Open a unified WebSocket connection - automatically determines if it's for upload or flow
   * based on the ID format (upload IDs typically start with 'upload-', job IDs start with 'job-')
   */
  async openWebSocket(id: string): Promise<WebSocketLike> {
    // Heuristic: if ID starts with 'upload-' or contains upload-related patterns, treat as upload
    // Otherwise, treat as flow/job
    if (id.startsWith("upload-") || id.includes("upload")) {
      return await this.openUploadWebSocket(id);
    }
    return await this.openFlowWebSocket(id);
  }

  /**
   * Close upload WebSocket connection
   */
  closeUploadWebSocket(uploadId: string): void {
    const ws = this.uploadWebsockets.get(uploadId);
    if (ws) {
      this.uploadistaApi.closeWebSocket(ws);
      this.uploadWebsockets.delete(uploadId);
    }
  }

  /**
   * Close flow WebSocket connection
   */
  closeFlowWebSocket(jobId: string): void {
    const ws = this.flowWebsockets.get(jobId);
    if (ws) {
      this.uploadistaApi.closeWebSocket(ws);
      this.flowWebsockets.delete(jobId);
    }
  }

  /**
   * Close WebSocket connection by ID (auto-detects type)
   */
  closeWebSocket(id: string): void {
    // Try both maps
    this.closeUploadWebSocket(id);
    this.closeFlowWebSocket(id);
  }

  /**
   * Close all WebSocket connections (both upload and flow)
   */
  closeAll(): void {
    // Close all upload websockets
    for (const [uploadId, ws] of this.uploadWebsockets.entries()) {
      this.uploadistaApi.closeWebSocket(ws);
      this.uploadWebsockets.delete(uploadId);
    }

    // Close all flow websockets
    for (const [jobId, ws] of this.flowWebsockets.entries()) {
      this.uploadistaApi.closeWebSocket(ws);
      this.flowWebsockets.delete(jobId);
    }
  }

  /**
   * Send ping to flow WebSocket
   */
  sendPing(jobId: string): boolean {
    const ws = this.flowWebsockets.get(jobId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "ping",
          timestamp: new Date().toISOString(),
        }),
      );
      return true;
    }
    return false;
  }

  /**
   * Get upload WebSocket by ID
   */
  getUploadWebSocket(uploadId: string): WebSocketLike | undefined {
    return this.uploadWebsockets.get(uploadId);
  }

  /**
   * Get flow WebSocket by ID
   */
  getFlowWebSocket(jobId: string): WebSocketLike | undefined {
    return this.flowWebsockets.get(jobId);
  }

  /**
   * Check if upload WebSocket is connected
   */
  isUploadConnected(uploadId: string): boolean {
    const ws = this.uploadWebsockets.get(uploadId);
    return ws?.readyState === ws?.OPEN;
  }

  /**
   * Check if flow WebSocket is connected
   */
  isFlowConnected(jobId: string): boolean {
    const ws = this.flowWebsockets.get(jobId);
    return ws?.readyState === ws?.OPEN;
  }

  /**
   * Check if WebSocket is connected (auto-detects type)
   */
  isConnected(id: string): boolean {
    return this.isUploadConnected(id) || this.isFlowConnected(id);
  }

  /**
   * Get total number of active WebSocket connections
   */
  getConnectionCount(): number {
    return this.uploadWebsockets.size + this.flowWebsockets.size;
  }

  /**
   * Get connection counts by type
   */
  getConnectionCountByType(): {
    upload: number;
    flow: number;
    total: number;
  } {
    return {
      upload: this.uploadWebsockets.size,
      flow: this.flowWebsockets.size,
      total: this.uploadWebsockets.size + this.flowWebsockets.size,
    };
  }
}
