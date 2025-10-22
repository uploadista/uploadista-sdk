import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpClient } from "../../services";
import { AuthHttpClient } from "../auth-http-client";
import { DirectAuthManager } from "../direct-auth";
import { NoAuthManager } from "../no-auth";
import type { DirectAuthConfig, UploadistaCloudAuthConfig } from "../types";
import { UploadistaCloudAuthManager } from "../uploadista-cloud-auth";

// Mock fetch globally
global.fetch = vi.fn();

describe("AuthHttpClient", () => {
  let mockHttpClient: HttpClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock HTTP client
    mockHttpClient = {
      request: vi.fn(async () => ({
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        ok: true,
        json: async () => ({}),
        text: async () => "",
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
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

  describe("with NoAuthManager", () => {
    it("should pass through requests unchanged", async () => {
      const authManager = new NoAuthManager();
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      await authClient.request("https://api.example.com/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        "https://api.example.com/upload",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
    });
  });

  describe("with DirectAuthManager", () => {
    it("should attach credentials from DirectAuthManager", async () => {
      const config: DirectAuthConfig = {
        mode: "direct",
        getCredentials: () => ({
          headers: { Authorization: "Bearer direct-token" },
        }),
      };
      const authManager = new DirectAuthManager(config);
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      await authClient.request("https://api.example.com/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        "https://api.example.com/upload",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer direct-token",
          },
        },
      );
    });

    it("should handle async credentials", async () => {
      const config: DirectAuthConfig = {
        mode: "direct",
        getCredentials: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { headers: { Authorization: "Bearer async-token" } };
        },
      };
      const authManager = new DirectAuthManager(config);
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      await authClient.request("https://api.example.com/upload");

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        "https://api.example.com/upload",
        {
          headers: { Authorization: "Bearer async-token" },
        },
      );
    });
  });

  describe("with SaasAuthManager", () => {
    it("should attach JWT token from SaasAuthManager", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "jwt-token-123" }),
      } as Response);

      const authManager = new SaasAuthManager(config);
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      await authClient.request("https://api.example.com/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        "https://api.example.com/upload",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer jwt-token-123",
          },
        },
      );
    });

    it("should extract job ID from upload URL", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "jwt-token-for-upload-123" }),
      } as Response);

      const authManager = new SaasAuthManager(config);
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      await authClient.request(
        "https://api.example.com/uploadista/api/upload/upload-123",
        { method: "PATCH" },
      );

      // Token should be cached for upload-123
      const stats = authManager.getCacheStats();
      expect(stats.cachedJobCount).toBe(1);
    });

    it("should extract job ID from flow URL", async () => {
      const config: SaasAuthConfig = {
        mode: "uploadista-cloud",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "jwt-token-for-flow-456" }),
      } as Response);

      const authManager = new SaasAuthManager(config);
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      await authClient.request(
        "https://api.example.com/uploadista/api/flow/flow-456/storage-id",
        { method: "POST" },
      );

      // Token should be cached for flow-456
      const stats = authManager.getCacheStats();
      expect(stats.cachedJobCount).toBe(1);
    });

    it("should extract job ID from jobs URL", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "jwt-token-for-job-789" }),
      } as Response);

      const authManager = new SaasAuthManager(config);
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      await authClient.request(
        "https://api.example.com/uploadista/api/jobs/job-789/status",
        { method: "GET" },
      );

      // Token should be cached for job-789
      const stats = authManager.getCacheStats();
      expect(stats.cachedJobCount).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should propagate auth errors", async () => {
      const config: DirectAuthConfig = {
        mode: "direct",
        getCredentials: () => {
          throw new Error("Failed to get auth credentials");
        },
      };

      const authManager = new DirectAuthManager(config);
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      await expect(
        authClient.request("https://api.example.com/upload"),
      ).rejects.toThrow("Failed to attach auth credentials");
    });

    it("should propagate HTTP client errors", async () => {
      const authManager = new NoAuthManager();
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      vi.mocked(mockHttpClient.request).mockRejectedValueOnce(
        new Error("Network error"),
      );

      await expect(
        authClient.request("https://api.example.com/upload"),
      ).rejects.toThrow("Network error");
    });
  });

  describe("delegation methods", () => {
    it("should delegate getMetrics", () => {
      const authManager = new NoAuthManager();
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      authClient.getMetrics();
      expect(mockHttpClient.getMetrics).toHaveBeenCalled();
    });

    it("should delegate getDetailedMetrics", () => {
      const authManager = new NoAuthManager();
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      authClient.getDetailedMetrics();
      expect(mockHttpClient.getDetailedMetrics).toHaveBeenCalled();
    });

    it("should delegate reset", () => {
      const authManager = new NoAuthManager();
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      authClient.reset();
      expect(mockHttpClient.reset).toHaveBeenCalled();
    });

    it("should delegate close", async () => {
      const authManager = new NoAuthManager();
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      await authClient.close();
      expect(mockHttpClient.close).toHaveBeenCalled();
    });

    it("should delegate warmupConnections", async () => {
      const authManager = new NoAuthManager();
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      await authClient.warmupConnections(["https://api.example.com"]);
      expect(mockHttpClient.warmupConnections).toHaveBeenCalledWith([
        "https://api.example.com",
      ]);
    });
  });

  describe("getAuthManager", () => {
    it("should return the auth manager", () => {
      const authManager = new NoAuthManager();
      const authClient = new AuthHttpClient(mockHttpClient, authManager);

      expect(authClient.getAuthManager()).toBe(authManager);
    });
  });
});
