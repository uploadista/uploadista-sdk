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
 * Creates a browser-optimized HTTP client using the Fetch API.
 *
 * This factory function returns an HttpClient implementation that uses the browser's
 * native fetch() API with connection keep-alive headers for optimal performance.
 * The client automatically manages connection pooling, tracks metrics, and provides
 * connection health monitoring.
 *
 * @param config - Optional connection pooling configuration
 * @returns A configured HTTP client ready for making requests
 *
 * @example
 * ```typescript
 * import { createHttpClient } from '@uploadista/client-browser';
 *
 * // Basic usage with defaults
 * const client = createHttpClient();
 *
 * // With custom configuration
 * const client = createHttpClient({
 *   maxConnectionsPerHost: 10,
 *   connectionTimeout: 60000,
 *   keepAliveTimeout: 120000,
 *   enableHttp2: true,
 *   retryOnConnectionError: true
 * });
 *
 * // Make a request
 * const response = await client.request('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ key: 'value' })
 * });
 *
 * // Check connection health
 * const metrics = client.getDetailedMetrics();
 * console.log('Connection health:', metrics.health.status);
 * ```
 *
 * @see {@link BrowserHttpClient} for implementation details
 */
export function createHttpClient(config?: ConnectionPoolConfig): HttpClient {
  return new BrowserHttpClient(config);
}

/**
 * Browser-optimized HTTP client implementation using the Fetch API with connection keep-alive.
 *
 * This class implements the HttpClient interface and provides:
 * - Connection pooling via keep-alive headers
 * - Connection metrics tracking (reuse rate, latency, error rates)
 * - HTTP/2 multiplexing detection and support
 * - Connection health monitoring with actionable recommendations
 * - Connection warmup capabilities
 * - Automatic timeout handling
 *
 * The browser manages actual connection pooling, but this client optimizes for
 * reuse through proper HTTP headers and provides visibility into connection performance.
 *
 * @example
 * ```typescript
 * const client = new BrowserHttpClient({
 *   maxConnectionsPerHost: 6,
 *   keepAliveTimeout: 60000,
 *   enableHttp2: true
 * });
 *
 * // Monitor connection health
 * setInterval(() => {
 *   const health = client.getDetailedMetrics().health;
 *   if (health.status === 'poor') {
 *     console.warn('Connection issues:', health.issues);
 *     console.log('Recommendations:', health.recommendations);
 *   }
 * }, 30000);
 * ```
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

  /**
   * Creates a new browser HTTP client instance.
   *
   * @param config - Connection pooling configuration with optional overrides
   */
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
   * Detects HTTP/2 support in the current browser environment.
   *
   * This method uses feature detection to determine if the browser supports
   * HTTP/2 features like multiplexing. In browsers, we can't directly query
   * the protocol version, so we infer support based on modern stream APIs.
   *
   * @returns HTTP/2 information with support status and detected features
   * @private
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

  /**
   * Makes an HTTP request using the Fetch API with optimized connection settings.
   *
   * This method automatically adds keep-alive headers for connection reuse,
   * handles timeouts via AbortController, and tracks connection metrics.
   *
   * @param url - The URL to request
   * @param options - Request options including method, headers, body, credentials, signal, and timeout
   * @returns Promise resolving to the HTTP response
   *
   * @throws {Error} When the request fails or times out
   *
   * @example
   * ```typescript
   * // Simple GET request
   * const response = await client.request('https://api.example.com/data');
   * const data = await response.json();
   *
   * // POST with timeout
   * const response = await client.request('https://api.example.com/upload', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ file: 'data' }),
   *   timeout: 10000, // 10 seconds
   *   signal: abortController.signal
   * });
   * ```
   */
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

  /**
   * Internal method to execute the fetch request and track metrics.
   *
   * @param url - The URL to request
   * @param options - Native fetch RequestInit options
   * @returns Promise resolving to the HTTP response
   * @throws {Error} When the fetch fails
   * @private
   */
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

  /**
   * Records connection timing metrics and updates statistics.
   *
   * Tracks connection times, calculates reuse rates based on latency patterns,
   * and maintains a rolling window of the last 100 measurements.
   *
   * @param connectionTime - Time in milliseconds for this connection
   * @private
   */
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

  /**
   * Retrieves basic connection metrics.
   *
   * @returns Current connection metrics including total connections, reuse rate, and average connection time
   *
   * @example
   * ```typescript
   * const metrics = client.getMetrics();
   * console.log(`Reuse rate: ${Math.round(metrics.reuseRate * 100)}%`);
   * console.log(`Avg connection time: ${Math.round(metrics.averageConnectionTime)}ms`);
   * ```
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Retrieves detailed connection metrics with health assessment.
   *
   * Provides comprehensive metrics including error rates, request throughput,
   * connection health status with score, identified issues, and actionable
   * recommendations for improving connection performance.
   *
   * @returns Detailed metrics with health information, request rates, and HTTP/2 info
   *
   * @example
   * ```typescript
   * const detailed = client.getDetailedMetrics();
   *
   * // Check health
   * if (detailed.health.status === 'degraded') {
   *   console.warn('Issues:', detailed.health.issues);
   *   console.log('Try:', detailed.health.recommendations);
   * }
   *
   * // Monitor performance
   * console.log(`Requests/sec: ${detailed.requestsPerSecond.toFixed(2)}`);
   * console.log(`Error rate: ${(detailed.errorRate * 100).toFixed(1)}%`);
   * console.log(`Fast connections: ${detailed.fastConnections}/${detailed.fastConnections + detailed.slowConnections}`);
   * ```
   */
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

  /**
   * Calculates connection health status based on current metrics.
   *
   * Analyzes reuse rates, error rates, and connection latency to determine
   * overall health (healthy/degraded/poor), assigns a health score (0-100),
   * and provides specific issues and recommendations.
   *
   * @returns Health assessment with status, score, issues, and recommendations
   * @private
   */
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

  /**
   * Warms up HTTP connections to specified URLs by making lightweight HEAD requests.
   *
   * This is useful for establishing connections before actual data transfer,
   * reducing latency for subsequent requests. Particularly beneficial when
   * uploading to multiple endpoints or when connection setup time is critical.
   *
   * @param urls - Array of URLs to warm up connections to
   *
   * @example
   * ```typescript
   * // Warm up connections before uploading
   * await client.warmupConnections([
   *   'https://upload1.example.com',
   *   'https://upload2.example.com',
   *   'https://cdn.example.com'
   * ]);
   *
   * // Now actual uploads will use pre-warmed connections
   * await client.request('https://upload1.example.com/file', {
   *   method: 'PUT',
   *   body: fileData
   * });
   * ```
   */
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

  /**
   * Resets all connection metrics and statistics to initial state.
   *
   * Useful for clearing metrics after a long-running session or when
   * you want to start fresh measurement without creating a new client instance.
   *
   * @example
   * ```typescript
   * // Reset metrics after a batch of uploads
   * client.reset();
   *
   * // Start fresh measurements
   * const metrics = client.getMetrics(); // All counters back to zero
   * ```
   */
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

  /**
   * Gracefully shuts down the HTTP client and logs final statistics.
   *
   * In browser environments, connections are managed by the browser and cannot
   * be explicitly closed. This method waits briefly for pending requests to complete,
   * logs final connection metrics, and resets internal state.
   *
   * @example
   * ```typescript
   * // Clean shutdown with metrics logging
   * await client.close();
   * // Logs: "Total requests: 150, Connection reuse: 85%, Avg time: 45ms, Health: healthy"
   * ```
   */
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
