import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createUploadistaClient } from "@uploadista/client-browser";
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
      };

      renderHook(() => useUploadistaClient(options));

      expect(createUploadistaClient).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://api.example.com",
          storageId: "test-storage",
          chunkSize: 1024 * 1024,
        }),
      );
    });

    it("should return client and config", () => {
      const options = {
        baseUrl: "https://api.example.com",
        storageId: "test-storage",
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
      const options = {
        baseUrl: "https://api.example.com",
        storageId: "test-storage",
        uploadistaBasePath: "/custom/upload",
        chunkSize: 2 * 1024 * 1024,
        storeFingerprintForResuming: true,
        retryDelays: [1000, 2000, 5000],
        parallelUploads: 3,
        parallelChunkSize: 5,
        uploadStrategy: "parallel" as const,
        smartChunking: true,
        networkMonitoring: true,
        uploadMetrics: true,
        connectionPooling: true,
        auth: { token: "test-token" },
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
          uploadStrategy: "parallel",
          smartChunking: true,
          networkMonitoring: true,
          uploadMetrics: true,
          connectionPooling: true,
          auth: { token: "test-token" },
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
