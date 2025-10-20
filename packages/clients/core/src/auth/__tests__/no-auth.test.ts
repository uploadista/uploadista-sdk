import { describe, expect, it } from "vitest";
import { NoAuthManager } from "../no-auth";

describe("NoAuthManager", () => {
  describe("attachCredentials", () => {
    it("should return headers unchanged", async () => {
      const manager = new NoAuthManager();
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      const result = await manager.attachCredentials(headers);

      expect(result).toEqual(headers);
      expect(result).toBe(headers); // Should be same object
    });

    it("should handle empty headers", async () => {
      const manager = new NoAuthManager();
      const result = await manager.attachCredentials();

      expect(result).toEqual({});
    });
  });

  describe("clearToken", () => {
    it("should be a no-op", () => {
      const manager = new NoAuthManager();
      expect(() => manager.clearToken("job-1")).not.toThrow();
    });
  });

  describe("clearAllTokens", () => {
    it("should be a no-op", () => {
      const manager = new NoAuthManager();
      expect(() => manager.clearAllTokens()).not.toThrow();
    });
  });
});
