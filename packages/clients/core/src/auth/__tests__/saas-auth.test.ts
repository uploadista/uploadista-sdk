import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaasAuthManager } from "../saas-auth";
import type { SaasAuthConfig } from "../types";

// Mock fetch globally
global.fetch = vi.fn();

describe("SaasAuthManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchToken", () => {
    it("should fetch token from auth server", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({
          username: "user",
          password: "pass",
        }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "jwt-token-123",
          expiresIn: 3600,
        }),
      });

      const manager = new SaasAuthManager(config);
      const result = await manager.fetchToken();

      expect(result).toEqual({
        token: "jwt-token-123",
        expiresIn: 3600,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://auth.example.com/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username: "user", password: "pass" }),
        },
      );
    });

    it("should handle auth server errors", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "wrong" }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: "Invalid credentials" }),
      });

      const manager = new SaasAuthManager(config);

      await expect(manager.fetchToken()).rejects.toThrow(
        "Failed to fetch auth token: Invalid credentials",
      );
    });

    it("should handle network errors", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

      const manager = new SaasAuthManager(config);

      await expect(manager.fetchToken()).rejects.toThrow(
        "Failed to fetch auth token: Network error",
      );
    });

    it("should validate token response format", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ noToken: "here" }), // Missing token field
      });

      const manager = new SaasAuthManager(config);

      await expect(manager.fetchToken()).rejects.toThrow(
        "Auth server response missing 'token' field",
      );
    });
  });

  describe("attachToken", () => {
    it("should attach token as Bearer header", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "jwt-token-123" }),
      });

      const manager = new SaasAuthManager(config);
      const result = await manager.attachToken({
        "Content-Type": "application/json",
      });

      expect(result).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer jwt-token-123",
      });
    });

    it("should cache token and reuse it", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "jwt-token-123" }),
      });

      const manager = new SaasAuthManager(config);

      // First call - should fetch token
      await manager.attachToken();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call - should use cached token
      await manager.attachToken();
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it("should cache tokens per job ID", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-2" }),
        });

      const manager = new SaasAuthManager(config);

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
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should refetch expired tokens", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      // First token expires in 1 second
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: "jwt-token-old",
            expiresIn: 0.001, // Expires very soon
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-new" }),
        });

      const manager = new SaasAuthManager(config);

      // First call - fetch initial token
      await manager.attachToken();

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second call - should fetch new token because old one expired
      const result = await manager.attachToken();
      expect(result.Authorization).toBe("Bearer jwt-token-new");
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("clearToken", () => {
    it("should clear cached token for specific job", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-2" }),
        });

      const manager = new SaasAuthManager(config);

      // Cache token for job
      await manager.attachToken({}, "job-1");
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Clear token
      manager.clearToken("job-1");

      // Next call should fetch new token
      await manager.attachToken({}, "job-1");
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("clearAllTokens", () => {
    it("should clear all cached tokens", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-2" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-3" }),
        });

      const manager = new SaasAuthManager(config);

      // Cache tokens for multiple jobs
      await manager.attachToken({}, "job-1");
      await manager.attachToken(); // Global token

      // Clear all
      manager.clearAllTokens();

      // Next calls should fetch new tokens
      await manager.attachToken();
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("getCacheStats", () => {
    it("should return cache statistics", async () => {
      const config: SaasAuthConfig = {
        mode: "saas",
        authServerUrl: "https://auth.example.com/token",
        getCredentials: () => ({ username: "user", password: "pass" }),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-2" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "jwt-token-3" }),
        });

      const manager = new SaasAuthManager(config);

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
