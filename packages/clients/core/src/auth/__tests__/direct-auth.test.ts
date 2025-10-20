import { describe, expect, it } from "vitest";
import { DirectAuthManager } from "../direct-auth";
import type { DirectAuthConfig } from "../types";

describe("DirectAuthManager", () => {
  describe("attachCredentials", () => {
    it("should attach headers from getCredentials", async () => {
      const config: DirectAuthConfig = {
        mode: "direct",
        getCredentials: () => ({
          headers: {
            Authorization: "Bearer test-token",
            "X-API-Key": "api-key-123",
          },
        }),
      };

      const manager = new DirectAuthManager(config);
      const result = await manager.attachCredentials({
        "Content-Type": "application/json",
      });

      expect(result).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
        "X-API-Key": "api-key-123",
      });
    });

    it("should support async getCredentials", async () => {
      const config: DirectAuthConfig = {
        mode: "direct",
        getCredentials: async () => {
          // Simulate async token fetch
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            headers: {
              Authorization: "Bearer async-token",
            },
          };
        },
      };

      const manager = new DirectAuthManager(config);
      const result = await manager.attachCredentials();

      expect(result).toEqual({
        Authorization: "Bearer async-token",
      });
    });

    it("should handle empty credentials gracefully", async () => {
      const config: DirectAuthConfig = {
        mode: "direct",
        getCredentials: () => ({}),
      };

      const manager = new DirectAuthManager(config);
      const result = await manager.attachCredentials({
        "Content-Type": "application/json",
      });

      expect(result).toEqual({
        "Content-Type": "application/json",
      });
    });

    it("should override existing headers with credential headers", async () => {
      const config: DirectAuthConfig = {
        mode: "direct",
        getCredentials: () => ({
          headers: {
            Authorization: "Bearer new-token",
          },
        }),
      };

      const manager = new DirectAuthManager(config);
      const result = await manager.attachCredentials({
        Authorization: "Bearer old-token",
        "Content-Type": "application/json",
      });

      expect(result).toEqual({
        Authorization: "Bearer new-token",
        "Content-Type": "application/json",
      });
    });

    it("should throw error if getCredentials returns non-object", async () => {
      const config: DirectAuthConfig = {
        mode: "direct",
        getCredentials: () => null as any,
      };

      const manager = new DirectAuthManager(config);

      await expect(manager.attachCredentials()).rejects.toThrow(
        "Failed to attach auth credentials",
      );
    });

    it("should throw error if getCredentials throws", async () => {
      const config: DirectAuthConfig = {
        mode: "direct",
        getCredentials: () => {
          throw new Error("Token fetch failed");
        },
      };

      const manager = new DirectAuthManager(config);

      await expect(manager.attachCredentials()).rejects.toThrow(
        "Failed to attach auth credentials: Token fetch failed",
      );
    });

    it("should validate header types", async () => {
      const config: DirectAuthConfig = {
        mode: "direct",
        getCredentials: () => ({
          headers: {
            Authorization: 123 as any, // Invalid: number instead of string
          },
        }),
      };

      const manager = new DirectAuthManager(config);

      await expect(manager.attachCredentials()).rejects.toThrow(
        "Invalid header",
      );
    });
  });
});
