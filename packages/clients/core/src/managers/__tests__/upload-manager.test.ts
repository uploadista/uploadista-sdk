import type { UploadFile } from "@uploadista/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type UploadAbortController,
  type UploadFunction,
  UploadManager,
  type UploadManagerCallbacks,
  type UploadOptions,
  type UploadState,
} from "../upload-manager";

describe("UploadManager", () => {
  let mockUploadFn: ReturnType<typeof vi.fn<UploadFunction>>;
  let mockCallbacks: UploadManagerCallbacks;
  let mockAbortController: UploadAbortController;
  let stateChanges: UploadState[];

  beforeEach(() => {
    stateChanges = [];

    mockAbortController = {
      abort: vi.fn(),
    };

    mockUploadFn = vi
      .fn<UploadFunction>()
      .mockResolvedValue(mockAbortController);

    mockCallbacks = {
      onStateChange: vi.fn((state) => stateChanges.push({ ...state })),
      onProgress: vi.fn(),
      onChunkComplete: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onAbort: vi.fn(),
    };
  });

  describe("constructor", () => {
    it("should initialize with idle state", () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const state = manager.getState();

      expect(state).toEqual({
        status: "idle",
        progress: 0,
        bytesUploaded: 0,
        totalBytes: null,
        error: null,
        result: null,
      });
    });

    it("should not call onStateChange during initialization", () => {
      new UploadManager(mockUploadFn, mockCallbacks);
      expect(mockCallbacks.onStateChange).not.toHaveBeenCalled();
    });
  });

  describe("getState", () => {
    it("should return a copy of the current state", () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const state1 = manager.getState();
      const state2 = manager.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different objects
    });
  });

  describe("isUploading", () => {
    it("should return false when idle", () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      expect(manager.isUploading()).toBe(false);
    });

    it("should return true when uploading", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      expect(manager.isUploading()).toBe(true);
      await uploadPromise;
    });

    it("should return false after upload completes", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate success
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onSuccess?.({
        id: "file-1",
        offset: 1000,
        storage: "s3",
      } as UploadFile);

      await uploadPromise;
      expect(manager.isUploading()).toBe(false);
    });
  });

  describe("canRetry", () => {
    it("should return false when idle", () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      expect(manager.canRetry()).toBe(false);
    });

    it("should return false while uploading", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      expect(manager.canRetry()).toBe(false);
      await uploadPromise;
    });

    it("should return true after error", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate error
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onError?.(new Error("Upload failed"));

      await uploadPromise;
      expect(manager.canRetry()).toBe(true);
    });

    it("should return true after abort", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate abort
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onAbort?.();

      await uploadPromise;
      expect(manager.canRetry()).toBe(true);
    });

    it("should return false after successful upload", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate success
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onSuccess?.({
        id: "file-1",
        offset: 1000,
        storage: "s3",
      } as UploadFile);

      await uploadPromise;
      expect(manager.canRetry()).toBe(false);
    });

    it("should return false after reset", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate error
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onError?.(new Error("Upload failed"));

      await uploadPromise;
      expect(manager.canRetry()).toBe(true);

      manager.reset();
      expect(manager.canRetry()).toBe(false);
    });
  });

  describe("upload", () => {
    it("should update state to uploading", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      await manager.upload({ size: 1000 });

      expect(stateChanges[0]).toMatchObject({
        status: "uploading",
        progress: 0,
        bytesUploaded: 0,
        totalBytes: 1000,
      });
    });

    it("should extract totalBytes from File/Blob-like input", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      await manager.upload({ size: 5000 });

      expect(stateChanges[0].totalBytes).toBe(5000);
    });

    it("should call uploadFn with input and options", async () => {
      const options: UploadOptions = {
        metadata: { key: "value" },
      };
      const manager = new UploadManager(mockUploadFn, mockCallbacks, options);
      const input = { size: 1000 };

      await manager.upload(input);

      expect(mockUploadFn).toHaveBeenCalledWith(input, expect.any(Object));
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      expect(uploadOptions.metadata).toEqual({ key: "value" });
    });

    it("should handle successful upload", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate success
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      const result: UploadFile = {
        id: "file-1",
        offset: 1000,
        storage: "s3",
        size: 1000,
      };
      uploadOptions.onSuccess?.(result);

      await uploadPromise;

      expect(mockCallbacks.onSuccess).toHaveBeenCalledWith(result);
      expect(stateChanges).toContainEqual(
        expect.objectContaining({
          status: "success",
          result,
          progress: 100,
          bytesUploaded: 1000,
        }),
      );
    });

    it("should handle upload error", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate error
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      const error = new Error("Upload failed");
      uploadOptions.onError?.(error);

      await uploadPromise;

      expect(mockCallbacks.onError).toHaveBeenCalledWith(error);
      expect(stateChanges).toContainEqual(
        expect.objectContaining({
          status: "error",
          error,
        }),
      );
    });

    it("should handle upload abort", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate abort
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onAbort?.();

      await uploadPromise;

      expect(mockCallbacks.onAbort).toHaveBeenCalled();
      expect(stateChanges).toContainEqual(
        expect.objectContaining({
          status: "aborted",
        }),
      );
    });

    it("should track progress updates", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate progress
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onProgress?.(0, 0, 1000);
      uploadOptions.onProgress?.(500, 500, 1000);
      uploadOptions.onProgress?.(1000, 1000, 1000);

      await uploadPromise;

      expect(mockCallbacks.onProgress).toHaveBeenCalledTimes(3);
      expect(mockCallbacks.onProgress).toHaveBeenNthCalledWith(1, 0, 0, 1000);
      expect(mockCallbacks.onProgress).toHaveBeenNthCalledWith(
        2,
        50,
        500,
        1000,
      );
      expect(mockCallbacks.onProgress).toHaveBeenNthCalledWith(
        3,
        100,
        1000,
        1000,
      );
    });

    it("should handle chunk completion", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate chunk completion
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onChunkComplete?.(256, 256, 1000);
      uploadOptions.onChunkComplete?.(256, 512, 1000);

      await uploadPromise;

      expect(mockCallbacks.onChunkComplete).toHaveBeenCalledTimes(2);
      expect(mockCallbacks.onChunkComplete).toHaveBeenNthCalledWith(
        1,
        256,
        256,
        1000,
      );
      expect(mockCallbacks.onChunkComplete).toHaveBeenNthCalledWith(
        2,
        256,
        512,
        1000,
      );
    });

    it("should handle uploadFn throwing error", async () => {
      mockUploadFn.mockRejectedValue(new Error("Connection failed"));

      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      await manager.upload({ size: 1000 });

      expect(mockCallbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Connection failed",
        }),
      );
      expect(stateChanges).toContainEqual(
        expect.objectContaining({
          status: "error",
          error: expect.any(Error),
        }),
      );
    });

    it("should handle non-Error exceptions", async () => {
      mockUploadFn.mockRejectedValue("Network timeout");

      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      await manager.upload({ size: 1000 });

      expect(mockCallbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Network timeout",
        }),
      );
    });

    it("should invoke both manager and options callbacks", async () => {
      const optionCallbacks: Partial<UploadOptions> = {
        onProgress: vi.fn(),
        onSuccess: vi.fn(),
        onChunkComplete: vi.fn(),
      };

      const manager = new UploadManager(
        mockUploadFn,
        mockCallbacks,
        optionCallbacks,
      );
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate callbacks
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onProgress?.(500, 500, 1000);
      uploadOptions.onChunkComplete?.(500, 500, 1000);
      uploadOptions.onSuccess?.({
        id: "file-1",
        offset: 1000,
        storage: "s3",
      } as UploadFile);

      await uploadPromise;

      // Both sets of callbacks should be called
      expect(mockCallbacks.onProgress).toHaveBeenCalled();
      expect(optionCallbacks.onProgress).toHaveBeenCalled();
      expect(mockCallbacks.onChunkComplete).toHaveBeenCalled();
      expect(optionCallbacks.onChunkComplete).toHaveBeenCalled();
      expect(mockCallbacks.onSuccess).toHaveBeenCalled();
      expect(optionCallbacks.onSuccess).toHaveBeenCalled();
    });
  });

  describe("abort", () => {
    it("should call abort on abort controller", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      await manager.upload({ size: 1000 });

      manager.abort();

      expect(mockAbortController.abort).toHaveBeenCalled();
    });

    it("should do nothing if no upload is active", () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);

      expect(() => manager.abort()).not.toThrow();
      expect(mockAbortController.abort).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("should reset state to idle", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      // Simulate error
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onError?.(new Error("Upload failed"));

      await uploadPromise;

      // Reset
      stateChanges = [];
      manager.reset();

      expect(stateChanges[0]).toEqual({
        status: "idle",
        progress: 0,
        bytesUploaded: 0,
        totalBytes: null,
        error: null,
        result: null,
      });
    });

    it("should abort active upload before resetting", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      await manager.upload({ size: 1000 });

      manager.reset();

      expect(mockAbortController.abort).toHaveBeenCalled();
    });

    it("should clear lastInput so retry is not possible", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onError?.(new Error("Upload failed"));

      await uploadPromise;
      expect(manager.canRetry()).toBe(true);

      manager.reset();
      expect(manager.canRetry()).toBe(false);
    });
  });

  describe("retry", () => {
    it("should retry with same input after error", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const input = { size: 1000 };

      // First upload fails
      const uploadPromise = manager.upload(input);
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onError?.(new Error("Upload failed"));
      await uploadPromise;

      // Retry
      mockUploadFn.mockClear();
      manager.retry();

      expect(mockUploadFn).toHaveBeenCalledWith(input, expect.any(Object));
    });

    it("should retry with same input after abort", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const input = { size: 1000 };

      // First upload aborted
      const uploadPromise = manager.upload(input);
      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onAbort?.();
      await uploadPromise;

      // Retry
      mockUploadFn.mockClear();
      manager.retry();

      expect(mockUploadFn).toHaveBeenCalledWith(input, expect.any(Object));
    });

    it("should do nothing if canRetry is false", () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);

      manager.retry();

      expect(mockUploadFn).not.toHaveBeenCalled();
    });

    it("should do nothing after successful upload", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const uploadPromise = manager.upload({ size: 1000 });

      const uploadOptions = mockUploadFn.mock.calls[0][1];
      uploadOptions.onSuccess?.({
        id: "file-1",
        offset: 1000,
        storage: "s3",
      } as UploadFile);

      await uploadPromise;

      mockUploadFn.mockClear();
      manager.retry();

      expect(mockUploadFn).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should abort active upload", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      await manager.upload({ size: 1000 });

      manager.cleanup();

      expect(mockAbortController.abort).toHaveBeenCalled();
    });

    it("should do nothing if no upload is active", () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);

      expect(() => manager.cleanup()).not.toThrow();
    });

    it("should allow creating new upload after cleanup", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      await manager.upload({ size: 1000 });

      manager.cleanup();

      // Should be able to upload again
      await manager.upload({ size: 2000 });

      expect(mockUploadFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("edge cases", () => {
    it("should handle calling upload multiple times", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);

      await manager.upload({ size: 1000 });
      await manager.upload({ size: 2000 });

      expect(mockUploadFn).toHaveBeenCalledTimes(2);
    });

    it("should handle abort before upload function resolves", async () => {
      let resolveUpload: (value: UploadAbortController) => void;
      const uploadPromise = new Promise<UploadAbortController>((resolve) => {
        resolveUpload = resolve;
      });
      mockUploadFn.mockReturnValue(uploadPromise);

      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      const upload = manager.upload({ size: 1000 });

      // Abort before upload function resolves
      manager.abort();

      // Now resolve
      resolveUpload?.(mockAbortController);
      await upload;

      // Abort should have been attempted (though controller wasn't available yet)
      expect(manager.getState().status).toBe("uploading");
    });

    it("should handle input without size property", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);
      await manager.upload("string-input");

      expect(stateChanges[0].totalBytes).toBe(null);
    });

    it("should handle null/undefined input", async () => {
      const manager = new UploadManager(mockUploadFn, mockCallbacks);

      await manager.upload(null);
      expect(stateChanges[0].totalBytes).toBe(null);

      await manager.upload(undefined);
      expect(stateChanges[1].totalBytes).toBe(null);
    });
  });
});
