import type { AbortSignalLike } from "./abort-controller-service";

/**
 * Platform-agnostic request body type
 */
export type RequestBody = string | Uint8Array | ArrayBuffer | null | undefined;

export interface HeadersLike {
  get(name: string): string | null;
  has(name: string): boolean;
  forEach(callback: (value: string, name: string) => void): void;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignalLike;
  timeout?: number;
  credentials?: "include" | "omit" | "same-origin";
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: HeadersLike;
  ok: boolean;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ConnectionPoolConfig {
  maxConnectionsPerHost?: number;
  connectionTimeout?: number;
  keepAliveTimeout?: number;
  enableHttp2?: boolean;
  retryOnConnectionError?: boolean;
}

export interface ConnectionMetrics {
  activeConnections: number;
  totalConnections: number;
  reuseRate: number;
  averageConnectionTime: number;
}

export interface ConnectionHealth {
  status: "healthy" | "degraded" | "poor";
  score: number; // 0-100
  issues: string[];
  recommendations: string[];
}

export interface Http2Info {
  supported: boolean;
  detected: boolean;
  version: string;
  multiplexingActive: boolean;
}

export interface DetailedConnectionMetrics extends ConnectionMetrics {
  health: ConnectionHealth;
  requestsPerSecond: number;
  errorRate: number;
  timeouts: number;
  retries: number;
  fastConnections: number; // likely reused
  slowConnections: number; // likely new
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
