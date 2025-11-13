import type {
  AbortControllerFactory,
  AbortControllerLike,
  AbortSignalLike,
} from "../services/abort-controller-service";
import type { ChecksumService } from "../services/checksum-service";
import type {
  Base64Service,
  FileReaderService,
  FileSource,
  SliceResult,
} from "../services/file-reader-service";
import type { FingerprintService } from "../services/fingerprint-service";
import type {
  ConnectionMetrics,
  DetailedConnectionMetrics,
  HeadersLike,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from "../services/http-client";
import type { IdGenerationService } from "../services/id-generation-service";
import type {
  PlatformService,
  Timeout,
} from "../services/platform-service";
import type { ServiceContainer } from "../services/service-container";
import type { StorageService } from "../services/storage-service";
import type {
  WebSocketFactory,
  WebSocketLike,
} from "../services/websocket-service";

// Platform globals polyfill for testing environments
declare function setTimeout(callback: () => void, ms: number): number;
declare function clearTimeout(id: number): void;
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class Blob {
  readonly size: number;
  readonly type: string;
  slice(start?: number, end?: number, contentType?: string): Blob;
  arrayBuffer(): Promise<ArrayBuffer>;
}
declare function btoa(data: string): string;
declare function atob(data: string): string;

/**
 * Mock HTTP response configuration for testing
 */
export interface MockHttpResponseConfig {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  delay?: number;
}

/**
 * Mock HTTP client for testing upload logic without actual network calls
 *
 * Allows configuring responses for specific URLs and methods, with support
 * for delays to simulate network latency.
 *
 * @example Basic usage
 * ```typescript
 * const httpClient = new MockHttpClient();
 * httpClient.mockResponse('https://api.example.com/upload', {
 *   status: 200,
 *   body: { uploadId: 'abc123' }
 * });
 * ```
 */
export class MockHttpClient implements HttpClient {
  private responses = new Map<string, MockHttpResponseConfig>();
  private defaultResponse: MockHttpResponseConfig = {
    status: 200,
    statusText: "OK",
    body: {},
  };
  private requestLog: Array<{ url: string; options?: HttpRequestOptions }> = [];

  /**
   * Configure a mock response for a specific URL
   */
  mockResponse(url: string, config: MockHttpResponseConfig): void {
    this.responses.set(url, config);
  }

  /**
   * Set the default response for unmocked URLs
   */
  setDefaultResponse(config: MockHttpResponseConfig): void {
    this.defaultResponse = config;
  }

  /**
   * Get the log of all requests made
   */
  getRequestLog(): Array<{ url: string; options?: HttpRequestOptions }> {
    return [...this.requestLog];
  }

  /**
   * Clear the request log
   */
  clearRequestLog(): void {
    this.requestLog = [];
  }

  async request(
    url: string,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse> {
    // Log the request
    this.requestLog.push({ url, options });

    // Get the configured response or use default
    const config = this.responses.get(url) || this.defaultResponse;

    // Simulate network delay if configured
    if (config.delay) {
      await new Promise<void>((resolve) => setTimeout(() => resolve(), config.delay ?? 0));
    }

    // Create mock headers
    const headers: HeadersLike = {
      get: (name: string) => config.headers?.[name] ?? null,
      has: (name: string) => config.headers?.[name] !== undefined,
      forEach: (callback: (value: string, name: string) => void) => {
        if (config.headers) {
          for (const [key, value] of Object.entries(config.headers)) {
            // Call the callback directly with value and name
            (callback as (value: string, name: string) => void)(value, key);
          }
        }
      },
    };

    // Create mock response
    const status = config.status ?? 200;
    const response: HttpResponse = {
      status,
      statusText: config.statusText ?? "OK",
      headers,
      ok: status >= 200 && status < 300,
      json: async () => config.body,
      text: async () =>
        typeof config.body === "string"
          ? config.body
          : JSON.stringify(config.body),
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        const text =
          typeof config.body === "string"
            ? config.body
            : JSON.stringify(config.body);
        return new TextEncoder().encode(text).buffer as ArrayBuffer;
      },
    };

    return response;
  }

  getMetrics(): ConnectionMetrics {
    return {
      activeConnections: 0,
      totalConnections: this.requestLog.length,
      reuseRate: 0,
      averageConnectionTime: 0,
    };
  }

  getDetailedMetrics(): DetailedConnectionMetrics {
    return {
      activeConnections: 0,
      totalConnections: this.requestLog.length,
      reuseRate: 0,
      averageConnectionTime: 0,
      health: {
        status: "healthy",
        score: 100,
        issues: [],
        recommendations: [],
      },
      requestsPerSecond: 0,
      errorRate: 0,
      timeouts: 0,
      retries: 0,
      fastConnections: this.requestLog.length,
      slowConnections: 0,
      http2Info: {
        supported: false,
        detected: false,
        version: "1.1",
        multiplexingActive: false,
      },
    };
  }

  reset(): void {
    this.requestLog = [];
    this.responses.clear();
  }

  async close(): Promise<void> {
    // No-op for mock
  }

  async warmupConnections(_urls: string[]): Promise<void> {
    // No-op for mock
  }
}

/**
 * Mock storage service for testing without actual persistent storage
 *
 * Uses in-memory storage that can be inspected and manipulated for testing.
 */
export class MockStorageService implements StorageService {
  private storage = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.storage.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async findAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const [key, value] of this.storage.entries()) {
      result[key] = value;
    }
    return result;
  }

  async find(prefix: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Get the current storage state for inspection
   */
  getStorageState(): Map<string, string> {
    return new Map(this.storage);
  }

  /**
   * Clear all storage
   */
  clear(): void {
    this.storage.clear();
  }
}

/**
 * Mock file reader service for testing file operations
 *
 * Accepts either File/Blob objects or mock file data (Uint8Array).
 */
export class MockFileReaderService<UploadInput = unknown>
  implements FileReaderService<UploadInput>
{
  async openFile(input: UploadInput, _chunkSize: number): Promise<FileSource> {
    // Handle File/Blob objects
    if (
      input instanceof Blob ||
      (input && typeof input === "object" && "size" in input)
    ) {
      const file = input as Blob & { name?: string; lastModified?: number };
      return {
        input,
        size: file.size,
        name:
          "name" in file && typeof file.name === "string" ? file.name : null,
        type: file.type || null,
        lastModified:
          "lastModified" in file && typeof file.lastModified === "number"
            ? file.lastModified
            : null,
        slice: async (start: number, end: number): Promise<SliceResult> => {
          if (start >= file.size) {
            return { done: true, value: null, size: null };
          }
          const blob = file.slice(start, end);
          const arrayBuffer = await blob.arrayBuffer();
          const chunk = new Uint8Array(arrayBuffer);
          return { done: false, value: chunk, size: chunk.length };
        },
        close: () => {
          // No-op for Blob
        },
      };
    }

    // Handle Uint8Array for testing
    if (input instanceof Uint8Array) {
      const data = input;
      return {
        input,
        size: data.length,
        name: "test-file.bin",
        type: "application/octet-stream",
        lastModified: Date.now(),
        slice: async (start: number, end: number): Promise<SliceResult> => {
          if (start >= data.length) {
            return { done: true, value: null, size: null };
          }
          const chunk = data.slice(start, end);
          return { done: false, value: chunk, size: chunk.length };
        },
        close: () => {
          // No-op for Uint8Array
        },
      };
    }

    // Fallback for unknown types
    throw new Error(
      `MockFileReaderService: Unsupported input type: ${typeof input}`,
    );
  }
}

/**
 * Mock abort controller for testing cancellation
 */
export class MockAbortController implements AbortControllerLike {
  private _aborted = false;
  private listeners: Array<() => void> = [];

  get signal(): AbortSignalLike {
    return {
      aborted: this._aborted,
      addEventListener: (_event: string, listener: () => void) => {
        this.listeners.push(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        const index = this.listeners.indexOf(listener);
        if (index !== -1) {
          this.listeners.splice(index, 1);
        }
      },
    };
  }

  abort(): void {
    this._aborted = true;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/**
 * Mock abort controller factory
 */
export class MockAbortControllerFactory implements AbortControllerFactory {
  create(): AbortControllerLike {
    return new MockAbortController();
  }
}

/**
 * Mock WebSocket for testing real-time events
 */
export class MockWebSocket implements WebSocketLike {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = 0; // CONNECTING

  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection opening after a short delay
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) {
        this.onopen();
      }
    }, 10);
  }

  send(_data: string | Uint8Array): void {
    if (this.readyState !== 1) {
      throw new Error("WebSocket is not open");
    }
    // Mock implementation - in tests, you can override this
  }

  close(code = 1000, reason = ""): void {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  /**
   * Simulate receiving a message (for testing)
   */
  simulateMessage(data: string): void {
    if (this.readyState === 1 && this.onmessage) {
      this.onmessage({ data });
    }
  }

  /**
   * Simulate an error (for testing)
   */
  simulateError(message: string): void {
    if (this.onerror) {
      this.onerror({ message });
    }
  }
}

/**
 * Mock WebSocket factory
 */
export class MockWebSocketFactory implements WebSocketFactory {
  create(url: string): WebSocketLike {
    return new MockWebSocket(url);
  }
}

/**
 * Mock platform service
 */
export class MockPlatformService implements PlatformService {
  private timers = new Map<Timeout, ReturnType<typeof setTimeout>>();
  private timerId = 0;

  constructor(
    private browser = true,
    private online = true,
  ) {}

  setTimeout(callback: () => void, ms: number | undefined): Timeout {
    const id = ++this.timerId;
    const timer = setTimeout(callback, ms ?? 0);
    this.timers.set(id, timer);
    return id;
  }

  clearTimeout(id: Timeout): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  isBrowser(): boolean {
    return this.browser;
  }

  isOnline(): boolean {
    return this.online;
  }

  isFileLike(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false;
    // Check for File/Blob-like properties
    return (
      "size" in value &&
      typeof (value as { size: unknown }).size === "number" &&
      ("slice" in value || "type" in value)
    );
  }

  getFileName(file: unknown): string | undefined {
    if (
      typeof file === "object" &&
      file !== null &&
      "name" in file &&
      typeof (file as { name: unknown }).name === "string"
    ) {
      return (file as { name: string }).name;
    }
    return undefined;
  }

  getFileType(file: unknown): string | undefined {
    if (
      typeof file === "object" &&
      file !== null &&
      "type" in file &&
      typeof (file as { type: unknown }).type === "string"
    ) {
      return (file as { type: string }).type;
    }
    return undefined;
  }

  getFileSize(file: unknown): number | undefined {
    if (
      typeof file === "object" &&
      file !== null &&
      "size" in file &&
      typeof (file as { size: unknown }).size === "number"
    ) {
      return (file as { size: number }).size;
    }
    return undefined;
  }

  getFileLastModified(file: unknown): number | undefined {
    if (
      typeof file === "object" &&
      file !== null &&
      "lastModified" in file &&
      typeof (file as { lastModified: unknown }).lastModified === "number"
    ) {
      return (file as { lastModified: number }).lastModified;
    }
    return undefined;
  }

  /**
   * Set online status for testing
   */
  setOnline(online: boolean): void {
    this.online = online;
  }
}

/**
 * Mock checksum service
 */
export class MockChecksumService implements ChecksumService {
  async computeChecksum(_data: Uint8Array): Promise<string> {
    // Return a mock checksum
    return `mock-checksum-${Math.random().toString(36).substring(7)}`;
  }
}

/**
 * Mock fingerprint service
 */
export class MockFingerprintService<UploadInput>
  implements FingerprintService<UploadInput>
{
  async computeFingerprint(_input: UploadInput): Promise<string> {
    // Return a mock fingerprint
    return `mock-fingerprint-${Math.random().toString(36).substring(7)}`;
  }
}

/**
 * Mock ID generation service
 */
export class MockIdGenerationService implements IdGenerationService {
  private counter = 0;

  generate(): string {
    return `mock-id-${++this.counter}`;
  }
}

/**
 * Mock base64 service
 */
export class MockBase64Service implements Base64Service {
  toBase64(data: ArrayBuffer): string {
    // Simple mock implementation
    const bytes = new Uint8Array(data);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary);
  }

  fromBase64(data: string): ArrayBuffer {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

/**
 * Create a complete mock service container for testing
 *
 * @example
 * ```typescript
 * const services = createMockServiceContainer();
 * const client = createUploadistaClient({
 *   apiUrl: 'https://api.example.com',
 *   services,
 * });
 * ```
 */
export function createMockServiceContainer<
  UploadInput = unknown,
>(): ServiceContainer<UploadInput> {
  return {
    storage: new MockStorageService(),
    idGeneration: new MockIdGenerationService(),
    httpClient: new MockHttpClient(),
    fileReader: new MockFileReaderService<UploadInput>(),
    base64: new MockBase64Service(),
    websocket: new MockWebSocketFactory(),
    abortController: new MockAbortControllerFactory(),
    platform: new MockPlatformService(),
    checksumService: new MockChecksumService(),
    fingerprintService: new MockFingerprintService<UploadInput>(),
  };
}
