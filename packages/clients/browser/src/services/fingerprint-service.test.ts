import { describe, expect, it } from "vitest";
import { createFingerprintService } from "./fingerprint-service";

describe("createFingerprintService", () => {
  it("should create a fingerprint service", () => {
    const service = createFingerprintService();
    expect(service).toBeDefined();
    expect(service.computeFingerprint).toBeDefined();
    expect(typeof service.computeFingerprint).toBe("function");
  });

  describe("computeFingerprint", () => {
    it("should compute fingerprint for a File", async () => {
      const service = createFingerprintService();
      const file = new File(["Hello, World!"], "test.txt", {
        type: "text/plain",
      });

      const fingerprint = await service.computeFingerprint(
        file,
        "https://api.example.com"
      );

      // Should return a 64-character hex string (SHA-256)
      expect(fingerprint).toHaveLength(64);
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should compute fingerprint for a Blob", async () => {
      const service = createFingerprintService();
      const blob = new Blob(["Test content"], { type: "text/plain" });

      const fingerprint = await service.computeFingerprint(
        blob,
        "https://api.example.com"
      );

      expect(fingerprint).toHaveLength(64);
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should return same fingerprint for identical files", async () => {
      const service = createFingerprintService();
      const content = "Same content";
      const file1 = new File([content], "file1.txt", { type: "text/plain" });
      const file2 = new File([content], "file2.txt", { type: "text/plain" });

      const fingerprint1 = await service.computeFingerprint(
        file1,
        "https://api.example.com"
      );
      const fingerprint2 = await service.computeFingerprint(
        file2,
        "https://api.example.com"
      );

      expect(fingerprint1).toBe(fingerprint2);
    });

    it("should return different fingerprint for different files", async () => {
      const service = createFingerprintService();
      const file1 = new File(["Content A"], "file1.txt", { type: "text/plain" });
      const file2 = new File(["Content B"], "file2.txt", { type: "text/plain" });

      const fingerprint1 = await service.computeFingerprint(
        file1,
        "https://api.example.com"
      );
      const fingerprint2 = await service.computeFingerprint(
        file2,
        "https://api.example.com"
      );

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it("should return same fingerprint regardless of endpoint", async () => {
      const service = createFingerprintService();
      const file = new File(["Test content"], "test.txt", {
        type: "text/plain",
      });

      const fingerprint1 = await service.computeFingerprint(
        file,
        "https://api1.example.com"
      );
      const fingerprint2 = await service.computeFingerprint(
        file,
        "https://api2.example.com"
      );

      // The current implementation ignores the endpoint
      expect(fingerprint1).toBe(fingerprint2);
    });

    it("should handle empty file", async () => {
      const service = createFingerprintService();
      const file = new File([], "empty.txt", { type: "text/plain" });

      const fingerprint = await service.computeFingerprint(
        file,
        "https://api.example.com"
      );

      expect(fingerprint).toHaveLength(64);
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should handle binary content", async () => {
      const service = createFingerprintService();
      const binaryData = new Uint8Array([0, 1, 2, 255, 254, 253]);
      const blob = new Blob([binaryData], { type: "application/octet-stream" });

      const fingerprint = await service.computeFingerprint(
        blob,
        "https://api.example.com"
      );

      expect(fingerprint).toHaveLength(64);
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
