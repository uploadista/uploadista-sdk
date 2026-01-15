import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach, type MockInstance } from "vitest";
import { UploadistaProvider } from "../components/uploadista-provider";
import { useUpload } from "../hooks/use-upload";

// Create mock manager instance
const mockManagerInstance = {
  upload: vi.fn(),
  abort: vi.fn(),
  reset: vi.fn(),
  retry: vi.fn(),
  cleanup: vi.fn(),
  canRetry: vi.fn(() => false),
};

// Keep track of UploadManager constructor calls
let uploadManagerConstructorCalls: any[] = [];

// Mock dependencies
vi.mock("@uploadista/client-browser", () => ({
  createUploadistaClient: vi.fn(() => ({
    upload: vi.fn(),
    executeFlow: vi.fn(),
    discoverFlowInputs: vi.fn(),
    uploadWithFlow: vi.fn(),
    multiInputFlowUpload: vi.fn(),
    getChunkingInsights: vi.fn(() => ({
      currentChunkSize: 1024 * 1024,
      recommendedChunkSize: 1024 * 1024,
      networkCondition: "good",
    })),
    exportMetrics: vi.fn(() => ({})),
    getNetworkMetrics: vi.fn(() => ({
      averageSpeed: 1024 * 1024,
      currentSpeed: 1024 * 1024,
      estimatedTimeRemaining: 0,
    })),
    getNetworkCondition: vi.fn(() => "good"),
    resetMetrics: vi.fn(),
  })),
}));

vi.mock("@uploadista/client-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uploadista/client-core")>();

  // Use a proper class mock
  class MockUploadManager {
    constructor(...args: any[]) {
      uploadManagerConstructorCalls.push(args);
      Object.assign(this, mockManagerInstance);
    }

    upload = mockManagerInstance.upload;
    abort = mockManagerInstance.abort;
    reset = mockManagerInstance.reset;
    retry = mockManagerInstance.retry;
    cleanup = mockManagerInstance.cleanup;
    canRetry = mockManagerInstance.canRetry;
  }

  return {
    ...actual,
    UploadManager: MockUploadManager,
    FlowManager: class MockFlowManager {
      handleFlowEvent = vi.fn();
      handleUploadProgress = vi.fn();
      cleanup = vi.fn();
    },
  };
});

// Wrapper component that provides the context
const wrapper = ({ children }: { children: ReactNode }) => (
  <UploadistaProvider baseUrl="https://api.example.com" storageId="test">
    {children}
  </UploadistaProvider>
);

describe("useUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadManagerConstructorCalls = [];
    // Reset mock functions
    mockManagerInstance.upload.mockClear();
    mockManagerInstance.abort.mockClear();
    mockManagerInstance.reset.mockClear();
    mockManagerInstance.retry.mockClear();
    mockManagerInstance.cleanup.mockClear();
    mockManagerInstance.canRetry.mockReturnValue(false);
  });

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const { result } = renderHook(() => useUpload(), { wrapper });

      expect(result.current.state).toEqual({
        status: "idle",
        progress: 0,
        bytesUploaded: 0,
        totalBytes: null,
        error: null,
        result: null,
      });
    });

    it("should return isUploading as false initially", () => {
      const { result } = renderHook(() => useUpload(), { wrapper });

      expect(result.current.isUploading).toBe(false);
    });

    it("should return canRetry as false initially", () => {
      const { result } = renderHook(() => useUpload(), { wrapper });

      expect(result.current.canRetry).toBe(false);
    });

    it("should return control methods", () => {
      const { result } = renderHook(() => useUpload(), { wrapper });

      expect(typeof result.current.upload).toBe("function");
      expect(typeof result.current.abort).toBe("function");
      expect(typeof result.current.reset).toBe("function");
      expect(typeof result.current.retry).toBe("function");
    });

    it("should return metrics object", () => {
      const { result } = renderHook(() => useUpload(), { wrapper });

      expect(result.current.metrics).toBeDefined();
      expect(typeof result.current.metrics.getInsights).toBe("function");
      expect(typeof result.current.metrics.exportMetrics).toBe("function");
      expect(typeof result.current.metrics.getNetworkMetrics).toBe("function");
      expect(typeof result.current.metrics.getNetworkCondition).toBe("function");
      expect(typeof result.current.metrics.resetMetrics).toBe("function");
    });
  });

  describe("UploadManager initialization", () => {
    it("should create UploadManager on mount", () => {
      renderHook(() => useUpload(), { wrapper });

      expect(uploadManagerConstructorCalls.length).toBeGreaterThan(0);
    });

    it("should pass upload function as first argument to UploadManager", () => {
      renderHook(() => useUpload(), { wrapper });

      expect(uploadManagerConstructorCalls.length).toBeGreaterThan(0);
      expect(typeof uploadManagerConstructorCalls[0][0]).toBe("function");
    });

    it("should pass callbacks to UploadManager", () => {
      const onProgress = vi.fn();
      const onChunkComplete = vi.fn();
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onAbort = vi.fn();

      renderHook(
        () =>
          useUpload({
            onProgress,
            onChunkComplete,
            onSuccess,
            onError,
            onAbort,
          }),
        { wrapper },
      );

      expect(uploadManagerConstructorCalls.length).toBeGreaterThan(0);
      const callbacks = uploadManagerConstructorCalls[0][1];
      expect(callbacks.onProgress).toBe(onProgress);
      expect(callbacks.onChunkComplete).toBe(onChunkComplete);
      expect(callbacks.onSuccess).toBe(onSuccess);
      expect(callbacks.onError).toBe(onError);
      expect(callbacks.onAbort).toBe(onAbort);
    });

    it("should pass options to UploadManager", () => {
      const metadata = { key: "value" };
      const onShouldRetry = vi.fn();

      renderHook(
        () =>
          useUpload({
            metadata,
            uploadLengthDeferred: true,
            uploadSize: 1000,
            onShouldRetry,
          }),
        { wrapper },
      );

      expect(uploadManagerConstructorCalls.length).toBeGreaterThan(0);
      const options = uploadManagerConstructorCalls[0][2];
      expect(options.metadata).toEqual(metadata);
      expect(options.uploadLengthDeferred).toBe(true);
      expect(options.uploadSize).toBe(1000);
      expect(options.onShouldRetry).toBe(onShouldRetry);
    });

    it("should cleanup UploadManager on unmount", () => {
      const { unmount } = renderHook(() => useUpload(), { wrapper });

      unmount();

      expect(mockManagerInstance.cleanup).toHaveBeenCalled();
    });
  });

  describe("upload method", () => {
    it("should call manager.upload when upload is called", () => {
      const { result } = renderHook(() => useUpload(), { wrapper });

      const mockFile = new File(["test"], "test.txt", { type: "text/plain" });

      act(() => {
        result.current.upload(mockFile);
      });

      expect(mockManagerInstance.upload).toHaveBeenCalledWith(mockFile);
    });
  });

  describe("abort method", () => {
    it("should call manager.abort when abort is called", () => {
      const { result } = renderHook(() => useUpload(), { wrapper });

      act(() => {
        result.current.abort();
      });

      expect(mockManagerInstance.abort).toHaveBeenCalled();
    });
  });

  describe("reset method", () => {
    it("should call manager.reset when reset is called", () => {
      const { result } = renderHook(() => useUpload(), { wrapper });

      act(() => {
        result.current.reset();
      });

      expect(mockManagerInstance.reset).toHaveBeenCalled();
    });
  });

  describe("retry method", () => {
    it("should call manager.retry when retry is called", () => {
      const { result } = renderHook(() => useUpload(), { wrapper });

      act(() => {
        result.current.retry();
      });

      expect(mockManagerInstance.retry).toHaveBeenCalled();
    });
  });

  describe("canRetry", () => {
    it("should return manager canRetry value after re-render", () => {
      mockManagerInstance.canRetry.mockReturnValue(true);

      const { result, rerender } = renderHook(() => useUpload(), { wrapper });

      // Initial render - manager is created in useEffect, so canRetry is computed
      // After re-render, canRetry should reflect manager's value
      rerender();

      expect(result.current.canRetry).toBe(true);
    });

    it("should return false when manager.canRetry returns false", () => {
      mockManagerInstance.canRetry.mockReturnValue(false);

      const { result, rerender } = renderHook(() => useUpload(), { wrapper });
      rerender();

      expect(result.current.canRetry).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should throw when used outside provider", () => {
      expect(() => {
        renderHook(() => useUpload());
      }).toThrow("useUploadistaContext must be used within an UploadistaProvider");
    });
  });

  describe("method stability", () => {
    it("should return stable method references", () => {
      const { result, rerender } = renderHook(() => useUpload(), { wrapper });

      const firstUpload = result.current.upload;
      const firstAbort = result.current.abort;
      const firstReset = result.current.reset;
      const firstRetry = result.current.retry;

      rerender();

      expect(result.current.upload).toBe(firstUpload);
      expect(result.current.abort).toBe(firstAbort);
      expect(result.current.reset).toBe(firstReset);
      expect(result.current.retry).toBe(firstRetry);
    });
  });
});
