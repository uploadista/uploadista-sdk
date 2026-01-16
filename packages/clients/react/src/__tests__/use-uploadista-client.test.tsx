import { renderHook } from "@testing-library/react";
import { createUploadistaClient } from "@uploadista/client-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUploadistaClient } from "../hooks/use-uploadista-client";

vi.mock("@uploadista/client-browser", () => ({
  createUploadistaClient: vi.fn(() => ({
    upload: vi.fn(),
    executeFlow: vi.fn(),
    discoverFlowInputs: vi.fn(),
  })),
}));

describe("useUploadistaClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("client creation", () => {
    it("should create a client with provided options", () => {
      const options = {
        baseUrl: "https://api.example.com",
        storageId: "test-storage",
        chunkSize: 1024 * 1024,
        storeFingerprintForResuming: true,
      };

      renderHook(() => useUploadistaClient(options));

      expect(createUploadistaClient).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://api.example.com",
          storageId: "test-storage",
          chunkSize: 1024 * 1024,
          storeFingerprintForResuming: true,
        }),
      );
    });

    it("should return client and config", () => {
      const options = {
        baseUrl: "https://api.example.com",
        storageId: "test-storage",
        chunkSize: 1024 * 1024,
        storeFingerprintForResuming: true,
      };

      const { result } = renderHook(() => useUploadistaClient(options));

      expect(result.current.client).toBeDefined();
      expect(result.current.config).toEqual(options);
    });
  });

  describe("memoization", () => {
    it("should return same client instance when options are stable", () => {
      const options = {
        baseUrl: "https://api.example.com",
        storageId: "test-storage",
        chunkSize: 1024 * 1024,
        storeFingerprintForResuming: true,
      };

      const { result, rerender } = renderHook(() =>
        useUploadistaClient(options),
      );

      const firstClient = result.current.client;

      rerender();

      expect(result.current.client).toBe(firstClient);
      expect(createUploadistaClient).toHaveBeenCalledTimes(1);
    });

    it("should create new client when baseUrl changes", () => {
      const { rerender } = renderHook(
        ({ baseUrl }) =>
          useUploadistaClient({
            baseUrl,
            storageId: "test-storage",
            chunkSize: 1024 * 1024,
            storeFingerprintForResuming: true,
          }),
        {
          initialProps: { baseUrl: "https://api1.example.com" },
        },
      );

      expect(createUploadistaClient).toHaveBeenCalledTimes(1);

      rerender({ baseUrl: "https://api2.example.com" });

      expect(createUploadistaClient).toHaveBeenCalledTimes(2);
    });

    it("should create new client when storageId changes", () => {
      const { rerender } = renderHook(
        ({ storageId }) =>
          useUploadistaClient({
            baseUrl: "https://api.example.com",
            storageId,
            chunkSize: 1024 * 1024,
            storeFingerprintForResuming: true,
          }),
        {
          initialProps: { storageId: "storage-1" },
        },
      );

      expect(createUploadistaClient).toHaveBeenCalledTimes(1);

      rerender({ storageId: "storage-2" });

      expect(createUploadistaClient).toHaveBeenCalledTimes(2);
    });

    it("should create new client when chunkSize changes", () => {
      const { rerender } = renderHook(
        ({ chunkSize }) =>
          useUploadistaClient({
            baseUrl: "https://api.example.com",
            storageId: "test-storage",
            chunkSize,
            storeFingerprintForResuming: true,
          }),
        {
          initialProps: { chunkSize: 1024 * 1024 },
        },
      );

      expect(createUploadistaClient).toHaveBeenCalledTimes(1);

      rerender({ chunkSize: 2 * 1024 * 1024 });

      expect(createUploadistaClient).toHaveBeenCalledTimes(2);
    });
  });

  describe("options passthrough", () => {
    it("should pass all client options to createUploadistaClient", () => {
      const onEvent = vi.fn();
      const connectionPoolingConfig = { maxConnectionsPerHost: 6 };
      const options = {
        baseUrl: "https://api.example.com",
        storageId: "test-storage",
        uploadistaBasePath: "/custom/upload",
        chunkSize: 2 * 1024 * 1024,
        storeFingerprintForResuming: true,
        retryDelays: [1000, 2000, 5000],
        parallelUploads: 3,
        parallelChunkSize: 5,
        uploadStrategy: { preferredStrategy: "parallel" as const },
        smartChunking: { enabled: true },
        networkMonitoring: { maxSamples: 100 },
        uploadMetrics: { maxChunkHistory: 500 },
        connectionPooling: connectionPoolingConfig,
        auth: { mode: "direct" as const, getCredentials: () => ({ headers: { Authorization: "Bearer test-token" } }) },
        onEvent,
      };

      renderHook(() => useUploadistaClient(options));

      expect(createUploadistaClient).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://api.example.com",
          storageId: "test-storage",
          uploadistaBasePath: "/custom/upload",
          chunkSize: 2 * 1024 * 1024,
          storeFingerprintForResuming: true,
          retryDelays: [1000, 2000, 5000],
          parallelUploads: 3,
          parallelChunkSize: 5,
          uploadStrategy: { preferredStrategy: "parallel" },
          smartChunking: { enabled: true },
          networkMonitoring: { maxSamples: 100 },
          uploadMetrics: { maxChunkHistory: 500 },
          connectionPooling: connectionPoolingConfig,
          auth: expect.objectContaining({ mode: "direct" }),
          onEvent,
        }),
      );
    });
  });

  describe("config updates", () => {
    it("should return updated config when options change", () => {
      const { result, rerender } = renderHook(
        ({ storageId }) =>
          useUploadistaClient({
            baseUrl: "https://api.example.com",
            storageId,
            chunkSize: 1024 * 1024,
            storeFingerprintForResuming: true,
          }),
        {
          initialProps: { storageId: "storage-1" },
        },
      );

      expect(result.current.config.storageId).toBe("storage-1");

      rerender({ storageId: "storage-2" });

      expect(result.current.config.storageId).toBe("storage-2");
    });
  });
});
