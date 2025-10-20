import type {
  ConnectionHealth,
  ConnectionMetrics,
  ConnectionPoolConfig,
  DetailedConnectionMetrics,
  Http2Info,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from "@uploadista/client-core";

/**
 * Factory function to create a browser-optimized HTTP client
 */
export function createHttpClient(config?: ConnectionPoolConfig): HttpClient {
  return new BrowserHttpClient(config);
}

/**
 * Browser-optimized HTTP client using fetch() with connection keep-alive
 */
class BrowserHttpClient implements HttpClient {
  private config: Required<ConnectionPoolConfig>;
  private metrics: ConnectionMetrics;
  private connectionTimes: number[] = [];
  private requestCount = 0;
  private connectionCount = 0;
  private errorCount = 0;
  private timeoutCount = 0;
  private retryCount = 0;
  private startTime = Date.now();
  private http2Info: Http2Info;

  constructor(config: ConnectionPoolConfig = {}) {
    this.config = {
      maxConnectionsPerHost: config.maxConnectionsPerHost ?? 6,
      connectionTimeout: config.connectionTimeout ?? 30000,
      keepAliveTimeout: config.keepAliveTimeout ?? 60000,
      enableHttp2: config.enableHttp2 ?? true,
      retryOnConnectionError: config.retryOnConnectionError ?? true,
    };

    this.metrics = {
      activeConnections: 0,
      totalConnections: 0,
      reuseRate: 0,
      averageConnectionTime: 0,
    };

    // Initialize HTTP/2 detection
    this.http2Info = this.detectHttp2Support();
  }

  /**
   * Detect HTTP/2 support in the browser
   */
  private detectHttp2Support(): Http2Info {
    // Check if the browser supports HTTP/2
    const supported = "serviceWorker" in navigator && "fetch" in window;

    // In browsers, we can't directly detect HTTP/2 protocol version
    // but we can make educated guesses based on browser features
    const hasModernFeatures =
      "ReadableStream" in window &&
      "WritableStream" in window &&
      "TransformStream" in window;

    return {
      supported,
      detected: false, // Will be updated during actual requests
      version: hasModernFeatures ? "h2" : "h1.1",
      multiplexingActive: hasModernFeatures && this.config.enableHttp2,
    };
  }

  async request(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse> {
    this.requestCount++;

    // Create optimized fetch options for connection reuse
    const fetchOptions: RequestInit = {
      method: options.method || "GET",
      headers: {
        // Add connection keep-alive headers for better reuse
        Connection: "keep-alive",
        "Keep-Alive": `timeout=${this.config.keepAliveTimeout / 1000}`,
        ...options.headers,
      },
      body: options.body as BodyInit | null | undefined,
      credentials: options.credentials || "include",
      signal: options.signal as AbortSignal | undefined,
    };

    // Add timeout if specified
    if (options.timeout) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      if (options.signal) {
        options.signal.addEventListener("abort", () => controller.abort());
      }

      fetchOptions.signal = controller.signal;

      try {
        const response = await this.makeRequest(url, fetchOptions);
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    }

    return this.makeRequest(url, fetchOptions);
  }

  private async makeRequest(
    url: string,
    options: RequestInit,
  ): Promise<HttpResponse> {
    const startTime = Date.now();

    try {
      const response = await fetch(url, options);
      const connectionTime = Date.now() - startTime;

      this.recordConnectionMetrics(connectionTime);

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        ok: response.ok,
        json: () => response.json(),
        text: () => response.text(),
        arrayBuffer: () => response.arrayBuffer(),
      };
    } catch (error) {
      // Record failed connection attempt
      this.connectionCount++;
      throw error;
    }
  }

  private recordConnectionMetrics(connectionTime: number): void {
    this.connectionTimes.push(connectionTime);
    this.connectionCount++;

    // Keep only last 100 measurements for average calculation
    if (this.connectionTimes.length > 100) {
      this.connectionTimes.shift();
    }

    // Update metrics
    this.metrics.totalConnections = this.connectionCount;
    this.metrics.averageConnectionTime =
      this.connectionTimes.reduce((sum, time) => sum + time, 0) /
      this.connectionTimes.length;

    // Estimate reuse rate based on connection time patterns
    // Faster connections are likely reused connections
    const fastConnections = this.connectionTimes.filter(
      (time) => time < 100,
    ).length;
    this.metrics.reuseRate = fastConnections / this.connectionTimes.length;
  }

  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  getDetailedMetrics(): DetailedConnectionMetrics {
    const health = this.calculateConnectionHealth();
    const elapsed = (Date.now() - this.startTime) / 1000; // seconds
    const requestsPerSecond = elapsed > 0 ? this.requestCount / elapsed : 0;
    const errorRate =
      this.requestCount > 0 ? this.errorCount / this.requestCount : 0;

    const fastConnections = this.connectionTimes.filter(
      (time) => time < 100,
    ).length;
    const slowConnections = this.connectionTimes.length - fastConnections;

    return {
      ...this.metrics,
      health,
      requestsPerSecond,
      errorRate,
      timeouts: this.timeoutCount,
      retries: this.retryCount,
      fastConnections,
      slowConnections,
      http2Info: this.http2Info,
    };
  }

  private calculateConnectionHealth(): ConnectionHealth {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check reuse rate
    if (this.metrics.reuseRate < 0.3) {
      issues.push("Low connection reuse rate");
      recommendations.push("Check if keep-alive headers are working");
      score -= 30;
    } else if (this.metrics.reuseRate < 0.7) {
      issues.push("Moderate connection reuse rate");
      recommendations.push("Consider adjusting keep-alive timeout");
      score -= 15;
    }

    // Check error rate
    const errorRate =
      this.requestCount > 0 ? this.errorCount / this.requestCount : 0;
    if (errorRate > 0.1) {
      issues.push("High error rate");
      recommendations.push("Check network stability and server configuration");
      score -= 25;
    } else if (errorRate > 0.05) {
      issues.push("Moderate error rate");
      recommendations.push("Monitor network conditions");
      score -= 10;
    }

    // Check average connection time
    if (this.metrics.averageConnectionTime > 1000) {
      issues.push("Slow connection establishment");
      recommendations.push("Check network latency and DNS resolution");
      score -= 20;
    } else if (this.metrics.averageConnectionTime > 500) {
      issues.push("Moderate connection latency");
      recommendations.push("Consider connection warming");
      score -= 10;
    }

    // Determine status
    let status: "healthy" | "degraded" | "poor";
    if (score >= 80) {
      status = "healthy";
    } else if (score >= 60) {
      status = "degraded";
    } else {
      status = "poor";
    }

    return {
      status,
      score: Math.max(0, score),
      issues,
      recommendations,
    };
  }

  async warmupConnections(urls: string[]): Promise<void> {
    if (urls.length === 0) return;

    console.log(`Warming up connections to ${urls.length} hosts...`);

    // Make lightweight HEAD requests to warm up connections
    const warmupPromises = urls.map(async (url) => {
      try {
        await this.request(url, {
          method: "HEAD",
          timeout: 5000, // 5 second timeout for warmup
        });
      } catch (error) {
        // Ignore warmup failures - they're optional
        console.warn(`Connection warmup failed for ${url}:`, error);
      }
    });

    // Wait for all warmup requests (with timeout)
    await Promise.allSettled(warmupPromises);
    console.log("Connection warmup completed");
  }

  reset(): void {
    this.connectionTimes = [];
    this.requestCount = 0;
    this.connectionCount = 0;
    this.errorCount = 0;
    this.timeoutCount = 0;
    this.retryCount = 0;
    this.startTime = Date.now();
    this.metrics = {
      activeConnections: 0,
      totalConnections: 0,
      reuseRate: 0,
      averageConnectionTime: 0,
    };
    this.http2Info = this.detectHttp2Support();
  }

  async close(): Promise<void> {
    console.log("Gracefully shutting down HTTP client...");

    // In browser environment, we can't explicitly close connections
    // The browser manages connection pooling automatically
    // But we can clean up our internal state

    // Wait a short time for any pending requests to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Log final statistics
    const finalMetrics = this.getDetailedMetrics();
    console.log("Final connection metrics:", {
      totalRequests: this.requestCount,
      connectionReuse: `${Math.round(finalMetrics.reuseRate * 100)}%`,
      averageConnectionTime: `${Math.round(finalMetrics.averageConnectionTime)}ms`,
      health: finalMetrics.health.status,
    });

    this.reset();
    console.log("HTTP client shutdown complete");
  }
}
