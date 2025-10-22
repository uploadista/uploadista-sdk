import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpClient } from "../../services";
import type { UploadistaCloudAuthConfig } from "../types";
import { UploadistaCloudAuthManager } from "../uploadista-cloud-auth";

describe("UploadistaCloudAuthManager", () => {
  let mockHttpClient: HttpClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock HTTP client
    mockHttpClient = {
      request: vi.fn(),
      getMetrics: vi.fn(() => ({
        activeConnections: 0,
        totalConnections: 0,
        reuseRate: 0,
        averageConnectionTime: 0,
      })),
      getDetailedMetrics: vi.fn(() => ({
        activeConnections: 0,
        totalConnections: 0,
        reuseRate: 0,
        averageConnectionTime: 0,
        health: {
          status: "healthy" as const,
          score: 100,
          issues: [],
          recommendations: [],
        },
        requestsPerSecond: 0,
        errorRate: 0,
        timeouts: 0,
        retries: 0,
        fastConnections: 0,
        slowConnections: 0,
        http2Info: {
          supported: true,
          detected: false,
          version: "h2",
          multiplexingActive: false,
        },
      })),
      reset: vi.fn(),
      close: vi.fn(async () => {}),
      warmupConnections: vi.fn(async () => {}),
    };
  });

  describe("fetchToken", () => {
    it("should fetch token from auth server", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      vi.mocked(mockHttpClient.request).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "jwt-token-123",
          expiresIn: 3600,
        }),
      } as any);

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);
      const result = await manager.fetchToken();

      expect(result).toEqual({
        token: "jwt-token-123",
        expiresIn: 3600,
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        "https://auth.example.com/token/client-id-123",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });

    it("should handle auth server errors", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      vi.mocked(mockHttpClient.request).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => JSON.stringify({ error: "Invalid credentials" }),
      } as any);

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);

      await expect(manager.fetchToken()).rejects.toThrow(
        "Failed to fetch auth token",
      );
    });

    it("should handle network errors", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      vi.mocked(mockHttpClient.request).mockRejectedValueOnce(
        new Error("Network error"),
      );

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);

      await expect(manager.fetchToken()).rejects.toThrow(
        "Failed to fetch auth token: Network error",
      );
    });

    it("should validate token response format", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      vi.mocked(mockHttpClient.request).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ noToken: "here" }), // Missing token field
      } as any);

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);

      await expect(manager.fetchToken()).rejects.toThrow(
        "Auth server response missing 'token' field",
      );
    });
  });

  describe("attachToken", () => {
    it("should attach token as Bearer header", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      vi.mocked(mockHttpClient.request).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "jwt-token-123" }),
      } as any);

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);
      const result = await manager.attachToken({
        "Content-Type": "application/json",
      });

      expect(result).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer jwt-token-123",
      });
    });

    it("should cache token and reuse it", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      vi.mocked(mockHttpClient.request).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "jwt-token-123" }),
      } as any);

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);

      // First call - should fetch token
      await manager.attachToken();
      expect(mockHttpClient.request).toHaveBeenCalledTimes(1);

      // Second call - should use cached token
      await manager.attachToken();
      expect(mockHttpClient.request).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it("should cache tokens per job ID", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      vi.mocked(mockHttpClient.request)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-1" }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-2" }),
        } as any);

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);

      // Fetch token for job 1
      const result1 = await manager.attachToken({}, "job-1");
      expect(result1.Authorization).toBe("Bearer jwt-token-1");

      // Fetch token for job 2
      const result2 = await manager.attachToken({}, "job-2");
      expect(result2.Authorization).toBe("Bearer jwt-token-2");

      // Reuse token for job 1
      const result3 = await manager.attachToken({}, "job-1");
      expect(result3.Authorization).toBe("Bearer jwt-token-1");

      // Should have fetched twice (once per job)
      expect(mockHttpClient.request).toHaveBeenCalledTimes(2);
    });

    it("should refetch expired tokens", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      // First token expires in 1 second
      vi.mocked(mockHttpClient.request)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: "jwt-token-old",
            expiresIn: 0.001, // Expires very soon
          }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-new" }),
        } as any);

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);

      // First call - fetch initial token
      await manager.attachToken();

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second call - should fetch new token because old one expired
      const result = await manager.attachToken();
      expect(result.Authorization).toBe("Bearer jwt-token-new");
      expect(mockHttpClient.request).toHaveBeenCalledTimes(2);
    });
  });

  describe("clearToken", () => {
    it("should clear cached token for specific job", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      vi.mocked(mockHttpClient.request)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-1" }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-2" }),
        } as any);

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);

      // Cache token for job
      await manager.attachToken({}, "job-1");
      expect(mockHttpClient.request).toHaveBeenCalledTimes(1);

      // Clear token
      manager.clearToken("job-1");

      // Next call should fetch new token
      await manager.attachToken({}, "job-1");
      expect(mockHttpClient.request).toHaveBeenCalledTimes(2);
    });
  });

  describe("clearAllTokens", () => {
    it("should clear all cached tokens", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      vi.mocked(mockHttpClient.request)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-1" }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-2" }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-3" }),
        } as any);

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);

      // Cache tokens for multiple jobs
      await manager.attachToken({}, "job-1");
      await manager.attachToken(); // Global token

      // Clear all
      manager.clearAllTokens();

      // Next calls should fetch new tokens
      await manager.attachToken();
      expect(mockHttpClient.request).toHaveBeenCalledTimes(3);
    });
  });

  describe("getCacheStats", () => {
    it("should return cache statistics", async () => {
      const config: UploadistaCloudAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        clientId: "client-id-123",
      };

      vi.mocked(mockHttpClient.request)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-1" }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-2" }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-3" }),
        } as any);

      const manager = new UploadistaCloudAuthManager(config, mockHttpClient);

      // Initially empty
      expect(manager.getCacheStats()).toEqual({
        cachedJobCount: 0,
        hasGlobalToken: false,
      });

      // Cache tokens
      await manager.attachToken({}, "job-1");
      await manager.attachToken({}, "job-2");
      await manager.attachToken(); // Global

      expect(manager.getCacheStats()).toEqual({
        cachedJobCount: 2,
        hasGlobalToken: true,
      });
    });
  });
});
