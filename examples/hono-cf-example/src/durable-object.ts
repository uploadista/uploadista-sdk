import { UploadistaDurableObjectImpl } from "@uploadista/event-emitter-durable-object";

/**
 * Durable Object for managing Uploadista WebSocket connections.
 *
 * This class extends the base Uploadista Durable Object implementation,
 * which provides:
 * - Hibernatable WebSocket connections (cost-efficient)
 * - Event emission and broadcasting to all connected clients
 * - RPC methods for emit/subscribe/unsubscribe
 * - Automatic connection lifecycle management
 *
 * Each upload or flow gets its own DO instance, identified by the entity ID.
 * WebSocket connections are hibernatable, meaning:
 * - No CPU time charged when idle
 * - Auto-wakeup on incoming messages
 * - Persistent connections across evictions
 *
 * @example
 * ```typescript
 * // Client connects to WebSocket
 * const ws = new WebSocket(`wss://example.com/uploadista/ws/upload/${uploadId}`);
 *
 * // Server routes to this DO instance
 * // DO accepts connection with hibernation
 * // Events are broadcast to all connected clients
 * ```
 */
export class UploadistaDurableObject extends UploadistaDurableObjectImpl {
  // No additional implementation needed - inherits all functionality
  // from UploadistaDurableObjectImpl
  //
  // You can override methods here if you need custom behavior:
  // - fetch() for custom WebSocket handling
  // - emit() for custom event broadcasting
  // - webSocketMessage() for handling client messages
  // - webSocketClose() for cleanup logic
  // - webSocketError() for error handling

  /**
   * RPC method to execute a flow in the background.
   * This allows flows to run beyond the HTTP request lifetime in Cloudflare Workers.
   *
   * @param flowExecutionEffect - The Effect to execute (flow execution)
   */
  async executeFlow(flowExecutionData: {
    jobId: string;
    flowId: string;
    storageId: string;
    clientId: string | null;
    inputs: Record<string, any>;
  }): Promise<void> {
    console.log(`[DO executeFlow] Starting flow execution for job: ${flowExecutionData.jobId}`);

    // Store the flow execution data for later retrieval if needed
    // The actual execution will be triggered from the main worker with the full runtime
    await this.ctx.storage.put(`flow:${flowExecutionData.jobId}`, flowExecutionData);

    console.log(`[DO executeFlow] Flow data stored for job: ${flowExecutionData.jobId}`);
  }
}
