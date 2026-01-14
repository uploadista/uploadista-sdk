import { describe, expect, it } from "vitest";
import { createChecksumService } from "./checksum-service";

describe("createChecksumService", () => {
  it("should create a checksum service", () => {
    const service = createChecksumService();
    expect(service).toBeDefined();
    expect(service.computeChecksum).toBeDefined();
    expect(typeof service.computeChecksum).toBe("function");
  });

  describe("computeChecksum", () => {
    it("should compute checksum for Uint8Array data", async () => {
      const service = createChecksumService();
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      const checksum = await service.computeChecksum(data);

      // Should return a 64-character hex string (SHA-256)
      expect(checksum).toHaveLength(64);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should return same checksum for identical data", async () => {
      const service = createChecksumService();
      const data1 = new Uint8Array([1, 2, 3, 4, 5]);
      const data2 = new Uint8Array([1, 2, 3, 4, 5]);

      const checksum1 = await service.computeChecksum(data1);
      const checksum2 = await service.computeChecksum(data2);

      expect(checksum1).toBe(checksum2);
    });

    it("should return different checksum for different data", async () => {
      const service = createChecksumService();
      const data1 = new Uint8Array([1, 2, 3, 4, 5]);
      const data2 = new Uint8Array([5, 4, 3, 2, 1]);

      const checksum1 = await service.computeChecksum(data1);
      const checksum2 = await service.computeChecksum(data2);

      expect(checksum1).not.toBe(checksum2);
    });

    it("should handle empty data", async () => {
      const service = createChecksumService();
      const data = new Uint8Array([]);

      const checksum = await service.computeChecksum(data);

      expect(checksum).toHaveLength(64);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should handle large data", async () => {
      const service = createChecksumService();
      // Create 1KB of data
      const data = new Uint8Array(1024);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }

      const checksum = await service.computeChecksum(data);

      expect(checksum).toHaveLength(64);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
