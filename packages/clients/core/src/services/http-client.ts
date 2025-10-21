import type { AbortSignalLike } from "./abort-controller-service";

/**
 * Platform-agnostic request body type.
 *
 * Supports various data formats for HTTP request bodies across different platforms.
 */
export type RequestBody = string | Uint8Array | ArrayBuffer | null | undefined;

/**
 * Platform-agnostic HTTP headers interface.
 *
 * Provides a subset of the Web Headers API that works across platforms.
 */
export interface HeadersLike {
  /** Retrieves a header value by name, or null if not found */
  get(name: string): string | null;

  /** Checks if a header exists */
  has(name: string): boolean;

  /** Iterates over all headers */
  forEach(callback: (value: string, name: string) => void): void;
}

/**
 * Options for HTTP requests.
 *
 * Platform-agnostic configuration for making HTTP requests with support
 * for headers, body data, abort signals, timeouts, and credentials.
 */
export interface HttpRequestOptions {
  /** HTTP method (GET, POST, PATCH, DELETE, etc.) */
  method?: string;

  /** Request headers as key-value pairs */
  headers?: Record<string, string>;

  /** Request body data */
  body?: unknown;

  /** Abort signal for cancelling the request */
  signal?: AbortSignalLike;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Credentials mode for cross-origin requests */
  credentials?: "include" | "omit" | "same-origin";
}

/**
 * Platform-agnostic HTTP response interface.
 *
 * Provides a subset of the Web Response API that works across platforms.
 */
export interface HttpResponse {
  /** HTTP status code (200, 404, 500, etc.) */
  status: number;

  /** HTTP status text (OK, Not Found, etc.) */
  statusText: string;

  /** Response headers */
  headers: HeadersLike;

  /** True if status is in the 200-299 range */
  ok: boolean;

  /** Parses response body as JSON */
  json(): Promise<unknown>;

  /** Reads response body as text */
  text(): Promise<string>;

  /** Reads response body as ArrayBuffer */
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Configuration for HTTP connection pooling.
 *
 * Controls how connections are managed, reused, and maintained for optimal
 * upload performance. Properly configured connection pooling can significantly
 * improve upload speeds by reusing existing connections.
 */
export interface ConnectionPoolConfig {
  /** Maximum number of concurrent connections per host. Defaults to 8. */
  maxConnectionsPerHost?: number;

  /** Timeout for establishing new connections in milliseconds. Defaults to 20000. */
  connectionTimeout?: number;

  /** How long to keep idle connections alive in milliseconds. Defaults to 90000. */
  keepAliveTimeout?: number;

  /** Enable HTTP/2 for connection multiplexing. Defaults to true. */
  enableHttp2?: boolean;

  /** Automatically retry requests on connection errors. Defaults to true. */
  retryOnConnectionError?: boolean;
}

/**
 * Basic connection pool metrics.
 *
 * Provides insight into connection pool performance and efficiency.
 */
export interface ConnectionMetrics {
  /** Number of currently active connections */
  activeConnections: number;

  /** Total connections created since pool initialization */
  totalConnections: number;

  /** Ratio of connection reuse (0-1, higher is better) */
  reuseRate: number;

  /** Average time to establish connections in milliseconds */
  averageConnectionTime: number;
}

/**
 * Connection pool health assessment.
 *
 * Provides diagnostic information about connection pool health
 * and recommendations for optimization.
 */
export interface ConnectionHealth {
  /** Overall health status */
  status: "healthy" | "degraded" | "poor";

  /** Health score from 0-100 (higher is better) */
  score: number;

  /** List of identified issues affecting performance */
  issues: string[];

  /** Recommendations for improving connection pool performance */
  recommendations: string[];
}

/**
 * HTTP/2 support and status information.
 *
 * Indicates whether HTTP/2 is available and being used,
 * which can significantly improve upload performance through multiplexing.
 */
export interface Http2Info {
  /** Whether HTTP/2 is supported by the platform */
  supported: boolean;

  /** Whether HTTP/2 was detected on the server */
  detected: boolean;

  /** HTTP version being used (e.g., "2.0", "1.1") */
  version: string;

  /** Whether HTTP/2 multiplexing is actively being used */
  multiplexingActive: boolean;
}

/**
 * Detailed connection pool metrics with health diagnostics.
 *
 * Extends basic metrics with comprehensive diagnostic information
 * for troubleshooting performance issues.
 */
export interface DetailedConnectionMetrics extends ConnectionMetrics {
  /** Connection pool health assessment */
  health: ConnectionHealth;

  /** Average requests per second */
  requestsPerSecond: number;

  /** Ratio of failed requests (0-1) */
  errorRate: number;

  /** Number of requests that timed out */
  timeouts: number;

  /** Number of requests that were retried */
  retries: number;

  /** Number of fast connections (likely reused) */
  fastConnections: number;

  /** Number of slow connections (likely new) */
  slowConnections: number;

  /** HTTP/2 support and usage information */
  http2Info: Http2Info;
}

/**
 * HTTP client interface that provides connection pooling capabilities
 * for optimized upload performance.
 */
export interface HttpClient {
  /**
   * Make an HTTP request using connection pooling
   */
  request(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;

  /**
   * Get current connection pool metrics
   */
  getMetrics(): ConnectionMetrics;

  /**
   * Get detailed connection metrics with health diagnostics
   */
  getDetailedMetrics(): DetailedConnectionMetrics;

  /**
   * Reset connection pool and metrics
   */
  reset(): void;

  /**
   * Gracefully close all connections
   */
  close(): Promise<void>;

  /**
   * Warm up connections by making preflight requests
   */
  warmupConnections(urls: string[]): Promise<void>;
}
