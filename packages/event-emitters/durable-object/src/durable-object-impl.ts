// import { DurableObject } from "cloudflare:workers";
// import { WebSocketPair } from "@cloudflare/workers-types";
// import type { UploadEvent } from "@uploadista/core/types";

// export class UploadEventDurableObject extends DurableObject {
//   async fetch(_request: Request): Promise<Response> {
//     // Creates two ends of a WebSocket connection.
//     const webSocketPair = new WebSocketPair();
//     const [client, server] = Object.values(webSocketPair);

//     // Calling `acceptWebSocket()` informs the runtime that this WebSocket is to begin terminating
//     // request within the Durable Object. It has the effect of "accepting" the connection,
//     // and allowing the WebSocket to send and receive messages.
//     // Unlike `ws.accept()`, `state.acceptWebSocket(ws)` informs the Workers Runtime that the WebSocket
//     // is "hibernatable", so the runtime does not need to pin this Durable Object to memory while
//     // the connection is open. During periods of inactivity, the Durable Object can be evicted
//     // from memory, but the WebSocket connection will remain open. If at some later point the
//     // WebSocket receives a message, the runtime will recreate the Durable Object
//     // (run the `constructor`) and deliver the message to the appropriate handler.
//     this.ctx.acceptWebSocket(server);

//     return new Response(null, {
//       status: 101,
//       webSocket: client,
//     });
//   }

//   emit(event: UploadEvent) {
//     for (const ws of this.ctx.getWebSockets()) {
//       ws.send(JSON.stringify(event satisfies UploadEvent));
//     }
//   }

//   async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
//     // Upon receiving a message from the client, the server replies with the same message,
//     // and the total number of connections with the "[Durable Object]: " prefix
//     ws.send(
//       `[Durable Object] message: ${message}, connections: ${this.ctx.getWebSockets().length}`,
//     );
//   }

//   async webSocketClose(
//     ws: WebSocket,
//     code: number,
//     _reason: string,
//     _wasClean: boolean,
//   ) {
//     // If the client closes the connection, the runtime will invoke the webSocketClose() handler.
//     // Don't try to close an already closed WebSocket or use reserved close codes
//     if (ws.readyState === WebSocket.OPEN) {
//       // Use a valid close code instead of the potentially reserved one from the client
//       // 1000 = Normal Closure, 1001 = Going Away are safe codes to use
//       const validCloseCode =
//         code === 1006 || code < 1000 || code > 4999 ? 1000 : code;
//       ws.close(validCloseCode, "Durable Object is closing WebSocket");
//     }
//   }
// }
