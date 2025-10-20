import type {
  ConnectionHealth,
  ConnectionMetrics,
  ConnectionPoolConfig,
  DetailedConnectionMetrics,
  HeadersLike,
  Http2Info,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from "@uploadista/client-core";

/**
 * Expo-specific implementation of HttpClient using fetch API
 * Expo's fetch is similar to browser fetch but optimized for React Native
 */
export function createExpoHttpClient(
  config?: ConnectionPoolConfig,
): HttpClient {
  return new ExpoHttpClient(config);
}

/**
 * Expo HTTP client implementation
 */
class ExpoHttpClient implements HttpClient {
  private metrics: ConnectionMetrics;
  private connectionTimes: number[] = [];
  private requestCount = 0;
  private errorCount = 0;
  private timeoutCount = 0;
  private retryCount = 0;
  private startTime = Date.now();

  constructor(_config: ConnectionPoolConfig = {}) {
    // Configuration is stored for potential future use
    // Currently Expo doesn't expose connection pool configuration

    this.metrics = {
      activeConnections: 0,
      totalConnections: 0,
      reuseRate: 0,
      averageConnectionTime: 0,
    };
  }

  async request(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse> {
    this.requestCount++;

    const fetchOptions: RequestInit = {
      method: options.method || "GET",
      headers: options.headers,
      // biome-ignore lint/suspicious/noExplicitAny: Expo's BodyInit type compatibility
      body: options.body as any,
      signal: options.signal as AbortSignal | undefined,
    };

    // Add credentials if specified
    if (options.credentials) {
      // biome-ignore lint/suspicious/noExplicitAny: Expo's RequestCredentials type compatibility
      fetchOptions.credentials = options.credentials as any;
    }

    const startTime = Date.now();

    try {
      // Handle timeout
      const timeoutPromise = options.timeout
        ? new Promise<never>((_, reject) => {
            setTimeout(() => {
              this.timeoutCount++;
              reject(new Error(`Request timeout after ${options.timeout}ms`));
            }, options.timeout);
          })
        : null;

      const fetchPromise = fetch(url, fetchOptions);

      const response = timeoutPromise
        ? await Promise.race([fetchPromise, timeoutPromise])
        : await fetchPromise;

      const connectionTime = Date.now() - startTime;
      this.connectionTimes.push(connectionTime);
      this.metrics.totalConnections++;
      this.updateMetrics();

      // Convert fetch Response to HttpResponse
      return this.adaptResponse(response);
    } catch (error) {
      this.errorCount++;
      throw error;
    }
  }

  private adaptResponse(response: Response): HttpResponse {
    const headers: HeadersLike = {
      get: (name: string) => response.headers.get(name),
      has: (name: string) => response.headers.has(name),
      forEach: (callback: (value: string, name: string) => void) => {
        response.headers.forEach(callback);
      },
    };

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      ok: response.ok,
      json: () => response.json(),
      text: () => response.text(),
      arrayBuffer: () => response.arrayBuffer(),
    };
  }

  private updateMetrics(): void {
    if (this.connectionTimes.length > 0) {
      const sum = this.connectionTimes.reduce((a, b) => a + b, 0);
      this.metrics.averageConnectionTime = sum / this.connectionTimes.length;
    }

    // Estimate reuse rate based on connection times
    // Faster connections are likely reused
    const fastConnections = this.connectionTimes.filter(
      (time) => time < 100,
    ).length;
    this.metrics.reuseRate =
      this.connectionTimes.length > 0
        ? fastConnections / this.connectionTimes.length
        : 0;
  }

  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  getDetailedMetrics(): DetailedConnectionMetrics {
    const uptime = Date.now() - this.startTime;
    const requestsPerSecond =
      uptime > 0 ? this.requestCount / (uptime / 1000) : 0;
    const errorRate =
      this.requestCount > 0 ? this.errorCount / this.requestCount : 0;

    const fastConnections = this.connectionTimes.filter(
      (time) => time < 100,
    ).length;
    const slowConnections = this.connectionTimes.length - fastConnections;

    const health = this.calculateHealth(errorRate);

    const http2Info: Http2Info = {
      supported: false, // Expo doesn't support HTTP/2
      detected: false,
      version: "h1.1",
      multiplexingActive: false,
    };

    return {
      ...this.metrics,
      health,
      requestsPerSecond,
      errorRate,
      timeouts: this.timeoutCount,
      retries: this.retryCount,
      fastConnections,
      slowConnections,
      http2Info,
    };
  }

  private calculateHealth(errorRate: number): ConnectionHealth {
    let status: "healthy" | "degraded" | "poor";
    let score: number;
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (errorRate > 0.1) {
      status = "poor";
      score = 30;
      issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
      recommendations.push("Check network connectivity");
    } else if (errorRate > 0.05) {
      status = "degraded";
      score = 60;
      issues.push(`Moderate error rate: ${(errorRate * 100).toFixed(1)}%`);
      recommendations.push("Monitor connection stability");
    } else {
      status = "healthy";
      score = 100;
    }

    if (this.metrics.averageConnectionTime > 1000) {
      issues.push(
        `Slow connections: ${this.metrics.averageConnectionTime.toFixed(0)}ms avg`,
      );
      recommendations.push("Check network conditions");
      score = Math.min(score, 70);
    }

    return { status, score, issues, recommendations };
  }

  reset(): void {
    this.metrics = {
      activeConnections: 0,
      totalConnections: 0,
      reuseRate: 0,
      averageConnectionTime: 0,
    };
    this.connectionTimes = [];
    this.requestCount = 0;
    this.errorCount = 0;
    this.timeoutCount = 0;
    this.retryCount = 0;
    this.startTime = Date.now();
  }

  async close(): Promise<void> {
    // Expo fetch doesn't require explicit connection closing
    this.reset();
  }

  async warmupConnections(urls: string[]): Promise<void> {
    // Warmup by making HEAD requests to the URLs
    const promises = urls.map((url) =>
      this.request(url, { method: "HEAD" }).catch(() => {
        // Ignore warmup errors
      }),
    );
    await Promise.all(promises);
  }
}
