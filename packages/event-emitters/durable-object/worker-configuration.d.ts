declare module "cloudflare:workers" {
  abstract class DurableObject<Env = unknown>
    implements Rpc.DurableObjectBranded
  {
    [Rpc.__DURABLE_OBJECT_BRAND]: never;
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
    fetch?(request: Request): Response | Promise<Response>;
    alarm?(alarmInfo?: AlarmInvocationInfo): void | Promise<void>;
    webSocketMessage?(
      ws: WebSocket,
      message: string | ArrayBuffer,
    ): void | Promise<void>;
    webSocketClose?(
      ws: WebSocket,
      code: number,
      reason: string,
      wasClean: boolean,
    ): void | Promise<void>;
    webSocketError?(ws: WebSocket, error: unknown): void | Promise<void>;
  }
}
