import { describe, expect, it, vi } from "vitest";
import { computeblobSha256 } from "./hash-util";

describe("computeblobSha256", () => {
  it("should compute SHA-256 hash of a blob", async () => {
    const blob = new Blob(["Hello, World!"], { type: "text/plain" });
    const hash = await computeblobSha256(blob);

    // Hash should be a 64-character hex string
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should compute SHA-256 hash of a File", async () => {
    const file = new File(["Test content"], "test.txt", { type: "text/plain" });
    const hash = await computeblobSha256(file);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should return same hash for identical content", async () => {
    const content = "Same content for both";
    const blob1 = new Blob([content], { type: "text/plain" });
    const blob2 = new Blob([content], { type: "text/plain" });

    const hash1 = await computeblobSha256(blob1);
    const hash2 = await computeblobSha256(blob2);

    expect(hash1).toBe(hash2);
  });

  it("should return different hash for different content", async () => {
    const blob1 = new Blob(["Content A"], { type: "text/plain" });
    const blob2 = new Blob(["Content B"], { type: "text/plain" });

    const hash1 = await computeblobSha256(blob1);
    const hash2 = await computeblobSha256(blob2);

    expect(hash1).not.toBe(hash2);
  });

  it("should handle empty blob", async () => {
    const blob = new Blob([], { type: "text/plain" });
    const hash = await computeblobSha256(blob);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should handle binary content", async () => {
    const binaryData = new Uint8Array([0, 1, 2, 255, 254, 253]);
    const blob = new Blob([binaryData], { type: "application/octet-stream" });
    const hash = await computeblobSha256(blob);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should throw error when crypto API fails", async () => {
    // Save original
    const originalSubtle = crypto.subtle;

    // Mock crypto.subtle.digest to throw
    Object.defineProperty(crypto, "subtle", {
      value: {
        digest: vi.fn().mockRejectedValue(new Error("Crypto error")),
      },
      writable: true,
    });

    const blob = new Blob(["test"], { type: "text/plain" });

    await expect(computeblobSha256(blob)).rejects.toThrow(
      "Failed to compute file checksum",
    );

    // Restore original
    Object.defineProperty(crypto, "subtle", {
      value: originalSubtle,
      writable: true,
    });
  });
});
