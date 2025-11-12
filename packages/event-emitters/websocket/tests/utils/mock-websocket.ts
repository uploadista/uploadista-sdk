import type { WebSocketConnection } from "@uploadista/core/types";

export class MockWebSocketConnection implements WebSocketConnection {
  public id: string;
  public readyState: number = 1; // OPEN
  public sentMessages: string[] = [];
  public closed = false;

  constructor(id: string) {
    this.id = id;
  }

  send(data: string): void {
    if (this.readyState === 1) {
      this.sentMessages.push(data);
    } else {
      throw new Error("WebSocket is not open");
    }
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this.closed = true;
  }

  assertMessageReceived(message: string): void {
    if (!this.sentMessages.includes(message)) {
      throw new Error(
        `Expected message "${message}" not found in sent messages: ${JSON.stringify(this.sentMessages)}`,
      );
    }
  }

  getLastMessage(): string | null {
    return this.sentMessages[this.sentMessages.length - 1] || null;
  }
}

export function createMockWebSocketConnection(id: string): MockWebSocketConnection {
  return new MockWebSocketConnection(id);
}
