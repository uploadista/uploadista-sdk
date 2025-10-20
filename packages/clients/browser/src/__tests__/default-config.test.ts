import { describe, expect, it, vi } from "vitest";
import { createUploadClient } from "../upload/create-upload-client";

// Mock the dependencies
vi.mock("../upload-api", () => ({
  createUploadApi: vi.fn(() => ({
    openWebSocket: vi.fn(() => ({
      onmessage: null,
      onopen: null,
      onclose: null,
      close: vi.fn(),
    })),
    createUpload: vi.fn(),
    uploadChunk: vi.fn(),
    getUpload: vi.fn(),
    deleteUpload: vi.fn(),
  })),
}));

vi.mock("../generate-fingerprint", () => ({
  generateMd5Fingerprint: vi.fn(() => Promise.resolve("test-fingerprint")),
}));

vi.mock("../file-reader", () => ({
  browserFileReader: {
    openFile: vi.fn(() =>
      Promise.resolve({
        size: 1024 * 1024,
        slice: vi.fn(() =>
          Promise.resolve({
            value: new Uint8Array(1024),
            size: 1024,
            done: false,
          }),
        ),
        close: vi.fn(),
      }),
    ),
  },
}));

describe("Default Configuration", () => {
  it("should enable smart chunking by default", () => {
    const client = createUploadClient({
      baseUrl: "https://test.com",
      storageId: "test-storage",
      chunkSize: 1024 * 1024,
      storeFingerprintForResuming: true,
    });

    // Verify that the client has smart chunking utilities available
    expect(client.getNetworkMetrics).toBeDefined();
    expect(client.getNetworkCondition).toBeDefined();
    expect(client.getChunkingInsights).toBeDefined();
    expect(client.exportMetrics).toBeDefined();
    expect(client.resetMetrics).toBeDefined();

    // Verify that network metrics are initialized (empty but present)
    const metrics = client.getNetworkMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.averageSpeed).toBe(0);
  });

  it("should allow disabling smart chunking explicitly", () => {
    const client = createUploadClient({
      baseUrl: "https://test.com",
      storageId: "test-storage",
      chunkSize: 1024 * 1024,
      storeFingerprintForResuming: true,
      smartChunking: {
        enabled: false,
      },
    });

    // Smart chunking utilities should still be available for backwards compatibility
    expect(client.getNetworkMetrics).toBeDefined();
    expect(client.getNetworkCondition).toBeDefined();
  });

  it("should use default smart chunking configuration", () => {
    const client = createUploadClient({
      baseUrl: "https://test.com",
      storageId: "test-storage",
      chunkSize: 1024 * 1024,
      storeFingerprintForResuming: true,
    });

    const condition = client.getNetworkCondition();
    expect(condition).toBeDefined();
    expect(condition.type).toBe("unknown"); // Should start as unknown before any uploads
    expect(condition.confidence).toBe(0);
  });

  it("should provide performance insights even with no data", () => {
    const client = createUploadClient({
      baseUrl: "https://test.com",
      storageId: "test-storage",
      chunkSize: 1024 * 1024,
      storeFingerprintForResuming: true,
    });

    const insights = client.getChunkingInsights();
    expect(insights).toBeDefined();
    expect(insights.recommendations).toContain(
      "Insufficient data for analysis",
    );
    expect(insights.optimalChunkSizeRange.min).toBeGreaterThan(0);
    expect(insights.optimalChunkSizeRange.max).toBeGreaterThan(
      insights.optimalChunkSizeRange.min,
    );
  });
});
