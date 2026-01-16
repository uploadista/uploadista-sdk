import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./http-client";

describe("createHttpClient", () => {
  // Mock fetch globally
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("should create an HTTP client with default config", () => {
    const client = createHttpClient();
    expect(client).toBeDefined();
    expect(client.request).toBeDefined();
    expect(client.getMetrics).toBeDefined();
    expect(client.getDetailedMetrics).toBeDefined();
    expect(client.warmupConnections).toBeDefined();
    expect(client.reset).toBeDefined();
    expect(client.close).toBeDefined();
  });

  it("should create an HTTP client with custom config", () => {
    const client = createHttpClient({
      maxConnectionsPerHost: 10,
      connectionTimeout: 60000,
      keepAliveTimeout: 120000,
      enableHttp2: true,
      retryOnConnectionError: true,
    });
    expect(client).toBeDefined();
  });

  describe("request", () => {
    it("should make a GET request", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({ data: "test" }),
        text: vi.fn().mockResolvedValue("test"),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const client = createHttpClient();
      const response = await client.request("https://api.example.com/data");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Connection: "keep-alive",
          }),
        })
      );
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
    });

    it("should make a POST request with body", async () => {
      const mockResponse = {
        status: 201,
        statusText: "Created",
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({ id: 1 }),
        text: vi.fn().mockResolvedValue(""),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const client = createHttpClient();
      const body = JSON.stringify({ name: "test" });
      const response = await client.request("https://api.example.com/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          method: "POST",
          body,
        })
      );
      expect(response.status).toBe(201);
    });

    it("should handle request timeout", async () => {
      // Use real timers for this test since we need actual timing
      vi.useRealTimers();

      mockFetch.mockImplementation(
        (_url: string, options?: RequestInit) =>
          new Promise((resolve, reject) => {
            const signal = options?.signal;
            const timeoutId = setTimeout(() => {
              resolve({
                status: 200,
                statusText: "OK",
                ok: true,
                headers: new Headers(),
                json: vi.fn().mockResolvedValue({}),
                text: vi.fn().mockResolvedValue(""),
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
              });
            }, 1000);

            // Listen for abort signal
            signal?.addEventListener("abort", () => {
              clearTimeout(timeoutId);
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
      );

      const client = createHttpClient();

      await expect(
        client.request("https://api.example.com/slow", {
          timeout: 50,
        })
      ).rejects.toThrow();

      // Restore fake timers for other tests
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it("should pass abort signal", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const client = createHttpClient();
      const controller = new AbortController();

      await client.request("https://api.example.com/data", {
        signal: controller.signal,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should include credentials by default", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const client = createHttpClient();
      await client.request("https://api.example.com/data");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          credentials: "include",
        })
      );
    });

    it("should throw on fetch error", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const client = createHttpClient();

      await expect(
        client.request("https://api.example.com/data")
      ).rejects.toThrow("Network error");
    });
  });

  describe("getMetrics", () => {
    it("should return initial metrics", () => {
      const client = createHttpClient();
      const metrics = client.getMetrics();

      expect(metrics).toEqual({
        activeConnections: 0,
        totalConnections: 0,
        reuseRate: 0,
        averageConnectionTime: 0,
      });
    });

    it("should update metrics after requests", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const client = createHttpClient();

      await client.request("https://api.example.com/data");

      const metrics = client.getMetrics();
      expect(metrics.totalConnections).toBe(1);
      expect(metrics.averageConnectionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getDetailedMetrics", () => {
    it("should return detailed metrics", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const client = createHttpClient();
      await client.request("https://api.example.com/data");

      const detailed = client.getDetailedMetrics();

      expect(detailed.health).toBeDefined();
      expect(detailed.health.status).toBeDefined();
      expect(detailed.health.score).toBeDefined();
      expect(detailed.health.issues).toBeDefined();
      expect(detailed.health.recommendations).toBeDefined();
      expect(detailed.requestsPerSecond).toBeDefined();
      expect(detailed.errorRate).toBeDefined();
      expect(detailed.http2Info).toBeDefined();
    });

    it("should calculate health based on metrics", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const client = createHttpClient();

      // Make several requests
      for (let i = 0; i < 5; i++) {
        await client.request("https://api.example.com/data");
      }

      const detailed = client.getDetailedMetrics();
      expect(["healthy", "degraded", "poor"]).toContain(detailed.health.status);
      expect(detailed.health.score).toBeGreaterThanOrEqual(0);
      expect(detailed.health.score).toBeLessThanOrEqual(100);
    });
  });

  describe("warmupConnections", () => {
    it("should make HEAD requests to warm up connections", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const client = createHttpClient();
      await client.warmupConnections([
        "https://api1.example.com",
        "https://api2.example.com",
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api1.example.com",
        expect.objectContaining({
          method: "HEAD",
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api2.example.com",
        expect.objectContaining({
          method: "HEAD",
        })
      );
    });

    it("should handle warmup failures gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Connection failed"));

      const client = createHttpClient();

      // Should not throw
      await expect(
        client.warmupConnections(["https://api.example.com"])
      ).resolves.not.toThrow();
    });

    it("should handle empty URL list", async () => {
      const client = createHttpClient();

      await expect(client.warmupConnections([])).resolves.not.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("should reset all metrics", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const client = createHttpClient();

      // Make some requests
      await client.request("https://api.example.com/data");
      await client.request("https://api.example.com/data");

      // Verify metrics are populated
      let metrics = client.getMetrics();
      expect(metrics.totalConnections).toBe(2);

      // Reset
      client.reset();

      // Verify metrics are cleared
      metrics = client.getMetrics();
      expect(metrics.totalConnections).toBe(0);
      expect(metrics.reuseRate).toBe(0);
      expect(metrics.averageConnectionTime).toBe(0);
    });
  });

  describe("close", () => {
    it("should close gracefully", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const client = createHttpClient();

      await client.request("https://api.example.com/data");

      await expect(client.close()).resolves.not.toThrow();

      // Metrics should be reset after close
      const metrics = client.getMetrics();
      expect(metrics.totalConnections).toBe(0);
    });
  });
});
