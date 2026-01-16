import { describe, expect, it, vi } from "vitest";
import {
  calculateBackoff,
  calculateMultiUploadStats,
  calculateProgress,
  composeValidators,
  createFileSizeValidator,
  createFileTypeValidator,
  createRetryWrapper,
  delay,
  formatDuration,
  formatFileSize,
  formatProgress,
  formatSpeed,
  generateUploadId,
  getFileExtension,
  isAbortError,
  isAudioFile,
  isDocumentFile,
  isImageFile,
  isNetworkError,
  isVideoFile,
  validateFileType,
  type UploadItem,
} from "./framework-utils";

describe("formatFileSize", () => {
  it("should format 0 bytes correctly", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
  });

  it("should format bytes correctly", () => {
    expect(formatFileSize(500)).toBe("500 Bytes");
  });

  it("should format KB correctly", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("should format MB correctly", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1 MB");
    expect(formatFileSize(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });

  it("should format GB correctly", () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
  });

  it("should format TB correctly", () => {
    expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe("1 TB");
  });
});

describe("formatProgress", () => {
  it("should format progress percentage", () => {
    expect(formatProgress(0)).toBe("0%");
    expect(formatProgress(50)).toBe("50%");
    expect(formatProgress(100)).toBe("100%");
  });

  it("should round decimal progress", () => {
    expect(formatProgress(33.33)).toBe("33%");
    expect(formatProgress(66.67)).toBe("67%");
  });
});

describe("formatSpeed", () => {
  it("should format 0 B/s correctly", () => {
    expect(formatSpeed(0)).toBe("0 B/s");
  });

  it("should format B/s correctly", () => {
    expect(formatSpeed(500)).toBe("500 B/s");
  });

  it("should format KB/s correctly", () => {
    expect(formatSpeed(1024)).toBe("1 KB/s");
  });

  it("should format MB/s correctly", () => {
    expect(formatSpeed(1024 * 1024)).toBe("1 MB/s");
  });

  it("should format GB/s correctly", () => {
    expect(formatSpeed(1024 * 1024 * 1024)).toBe("1 GB/s");
  });
});

describe("formatDuration", () => {
  it("should format milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("should format seconds", () => {
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(30000)).toBe("30s");
  });

  it("should format minutes", () => {
    expect(formatDuration(60000)).toBe("1m");
    expect(formatDuration(90000)).toBe("1m 30s");
  });

  it("should format hours", () => {
    expect(formatDuration(3600000)).toBe("1h");
    expect(formatDuration(3660000)).toBe("1h 1m");
  });
});

describe("getFileExtension", () => {
  it("should extract file extension", () => {
    expect(getFileExtension("document.pdf")).toBe("pdf");
    expect(getFileExtension("image.PNG")).toBe("png");
    expect(getFileExtension("archive.tar.gz")).toBe("gz");
  });

  it("should return empty string for files without extension", () => {
    expect(getFileExtension("README")).toBe("");
    expect(getFileExtension("Makefile")).toBe("");
  });
});

describe("isImageFile", () => {
  it("should return true for image files", () => {
    const imageFile = new File([""], "test.png", { type: "image/png" });
    expect(isImageFile(imageFile)).toBe(true);
  });

  it("should return false for non-image files", () => {
    const textFile = new File([""], "test.txt", { type: "text/plain" });
    expect(isImageFile(textFile)).toBe(false);
  });
});

describe("isVideoFile", () => {
  it("should return true for video files", () => {
    const videoFile = new File([""], "test.mp4", { type: "video/mp4" });
    expect(isVideoFile(videoFile)).toBe(true);
  });

  it("should return false for non-video files", () => {
    const textFile = new File([""], "test.txt", { type: "text/plain" });
    expect(isVideoFile(textFile)).toBe(false);
  });
});

describe("isAudioFile", () => {
  it("should return true for audio files", () => {
    const audioFile = new File([""], "test.mp3", { type: "audio/mpeg" });
    expect(isAudioFile(audioFile)).toBe(true);
  });

  it("should return false for non-audio files", () => {
    const textFile = new File([""], "test.txt", { type: "text/plain" });
    expect(isAudioFile(textFile)).toBe(false);
  });
});

describe("isDocumentFile", () => {
  it("should return true for PDF files", () => {
    const pdfFile = new File([""], "test.pdf", { type: "application/pdf" });
    expect(isDocumentFile(pdfFile)).toBe(true);
  });

  it("should return true for Word documents", () => {
    const docFile = new File([""], "test.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(isDocumentFile(docFile)).toBe(true);
  });

  it("should return true for text files", () => {
    const textFile = new File([""], "test.txt", { type: "text/plain" });
    expect(isDocumentFile(textFile)).toBe(true);
  });

  it("should return false for image files", () => {
    const imageFile = new File([""], "test.png", { type: "image/png" });
    expect(isDocumentFile(imageFile)).toBe(false);
  });
});

describe("validateFileType", () => {
  it("should return true when no accept types specified", () => {
    const file = new File([""], "test.txt", { type: "text/plain" });
    expect(validateFileType(file, [])).toBe(true);
  });

  it("should validate by file extension", () => {
    const file = new File([""], "test.pdf", { type: "application/pdf" });
    expect(validateFileType(file, [".pdf"])).toBe(true);
    expect(validateFileType(file, [".doc"])).toBe(false);
  });

  it("should validate by MIME type", () => {
    const file = new File([""], "test.png", { type: "image/png" });
    expect(validateFileType(file, ["image/png"])).toBe(true);
    expect(validateFileType(file, ["image/jpeg"])).toBe(false);
  });

  it("should validate by MIME type wildcard", () => {
    const file = new File([""], "test.png", { type: "image/png" });
    expect(validateFileType(file, ["image/*"])).toBe(true);
    expect(validateFileType(file, ["video/*"])).toBe(false);
  });
});

describe("createFileSizeValidator", () => {
  it("should pass files under the size limit", () => {
    const validator = createFileSizeValidator(1024 * 1024); // 1MB
    const file = new File(["x".repeat(100)], "small.txt", { type: "text/plain" });
    const result = validator(file);
    expect(result.valid).toBe(true);
  });

  it("should fail files over the size limit", () => {
    const validator = createFileSizeValidator(100);
    const file = new File(["x".repeat(200)], "large.txt", { type: "text/plain" });
    const result = validator(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds maximum");
  });
});

describe("createFileTypeValidator", () => {
  it("should pass files with allowed extensions", () => {
    const validator = createFileTypeValidator([".pdf", ".doc"]);
    const file = new File([""], "test.pdf", { type: "application/pdf" });
    const result = validator(file);
    expect(result.valid).toBe(true);
  });

  it("should pass files with allowed MIME types", () => {
    const validator = createFileTypeValidator(["image/png"]);
    const file = new File([""], "test.png", { type: "image/png" });
    const result = validator(file);
    expect(result.valid).toBe(true);
  });

  it("should pass files with wildcard MIME types", () => {
    const validator = createFileTypeValidator(["image/*"]);
    const file = new File([""], "test.png", { type: "image/png" });
    const result = validator(file);
    expect(result.valid).toBe(true);
  });

  it("should fail files with disallowed types", () => {
    const validator = createFileTypeValidator([".pdf"]);
    const file = new File([""], "test.txt", { type: "text/plain" });
    const result = validator(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });
});

describe("composeValidators", () => {
  it("should pass when all validators pass", () => {
    const sizeValidator = createFileSizeValidator(1024 * 1024);
    const typeValidator = createFileTypeValidator(["image/*"]);
    const composed = composeValidators(sizeValidator, typeValidator);

    const file = new File(["x".repeat(100)], "test.png", { type: "image/png" });
    const result = composed(file);
    expect(result.valid).toBe(true);
  });

  it("should fail when first validator fails", () => {
    const sizeValidator = createFileSizeValidator(10);
    const typeValidator = createFileTypeValidator(["image/*"]);
    const composed = composeValidators(sizeValidator, typeValidator);

    const file = new File(["x".repeat(100)], "test.png", { type: "image/png" });
    const result = composed(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds");
  });

  it("should fail when any validator fails", () => {
    const sizeValidator = createFileSizeValidator(1024 * 1024);
    const typeValidator = createFileTypeValidator([".pdf"]);
    const composed = composeValidators(sizeValidator, typeValidator);

    const file = new File(["x".repeat(100)], "test.png", { type: "image/png" });
    const result = composed(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });
});

describe("generateUploadId", () => {
  it("should generate unique IDs", () => {
    const id1 = generateUploadId();
    const id2 = generateUploadId();
    expect(id1).not.toBe(id2);
  });

  it("should start with 'upload-' prefix", () => {
    const id = generateUploadId();
    expect(id.startsWith("upload-")).toBe(true);
  });
});

describe("delay", () => {
  it("should resolve after specified time", async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});

describe("calculateBackoff", () => {
  it("should calculate exponential backoff", () => {
    const backoff0 = calculateBackoff(0, 1000, 30000);
    const backoff1 = calculateBackoff(1, 1000, 30000);
    const backoff2 = calculateBackoff(2, 1000, 30000);

    // Account for jitter (random addition up to 1000ms)
    expect(backoff0).toBeGreaterThanOrEqual(1000);
    expect(backoff0).toBeLessThan(2000);

    expect(backoff1).toBeGreaterThanOrEqual(2000);
    expect(backoff1).toBeLessThan(3000);

    expect(backoff2).toBeGreaterThanOrEqual(4000);
    expect(backoff2).toBeLessThan(5000);
  });

  it("should respect max delay", () => {
    const backoff = calculateBackoff(10, 1000, 5000);
    // With jitter, should be between 5000 and 6000
    expect(backoff).toBeLessThanOrEqual(6000);
  });
});

describe("createRetryWrapper", () => {
  it("should succeed on first try", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const wrapped = createRetryWrapper(fn, 3);

    const result = await wrapped();
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and eventually succeed", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("success");

    const wrapped = createRetryWrapper(fn, 3);

    const result = await wrapped();
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should throw after max attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    const wrapped = createRetryWrapper(fn, 2);

    await expect(wrapped()).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should respect shouldRetry callback", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("no retry"));
    const shouldRetry = vi.fn().mockReturnValue(false);
    const wrapped = createRetryWrapper(fn, 3, shouldRetry);

    await expect(wrapped()).rejects.toThrow("no retry");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("isNetworkError", () => {
  it("should return true for network-related errors", () => {
    expect(isNetworkError(new Error("network error"))).toBe(true);
    expect(isNetworkError(new Error("connection refused"))).toBe(true);
    expect(isNetworkError(new Error("timeout occurred"))).toBe(true);
    expect(isNetworkError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isNetworkError(new Error("ETIMEDOUT"))).toBe(true);
  });

  it("should return false for non-network errors", () => {
    expect(isNetworkError(new Error("generic error"))).toBe(false);
    expect(isNetworkError(new Error("validation failed"))).toBe(false);
  });

  it("should return false for non-Error values", () => {
    expect(isNetworkError("string")).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe("isAbortError", () => {
  it("should return true for abort errors", () => {
    const abortError = new Error("abort");
    abortError.name = "AbortError";
    expect(isAbortError(abortError)).toBe(true);
  });

  it("should return true for errors containing abort message", () => {
    expect(isAbortError(new Error("operation aborted"))).toBe(true);
  });

  it("should return false for non-abort errors", () => {
    expect(isAbortError(new Error("generic error"))).toBe(false);
  });

  it("should return false for non-Error values", () => {
    expect(isAbortError("string")).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe("calculateProgress", () => {
  it("should calculate progress percentage", () => {
    expect(calculateProgress(0, 100)).toBe(0);
    expect(calculateProgress(50, 100)).toBe(50);
    expect(calculateProgress(100, 100)).toBe(100);
  });

  it("should handle zero total", () => {
    expect(calculateProgress(50, 0)).toBe(0);
  });

  it("should clamp values between 0 and 100", () => {
    expect(calculateProgress(-10, 100)).toBe(0);
    expect(calculateProgress(150, 100)).toBe(100);
  });

  it("should round to nearest integer", () => {
    expect(calculateProgress(33, 100)).toBe(33);
    expect(calculateProgress(1, 3)).toBe(33);
  });
});

describe("calculateMultiUploadStats", () => {
  it("should calculate stats for empty uploads", () => {
    const stats = calculateMultiUploadStats([]);
    expect(stats.totalFiles).toBe(0);
    expect(stats.completedFiles).toBe(0);
    expect(stats.failedFiles).toBe(0);
    expect(stats.totalBytes).toBe(0);
    expect(stats.uploadedBytes).toBe(0);
    expect(stats.totalProgress).toBe(0);
    expect(stats.allComplete).toBe(true);
    expect(stats.hasErrors).toBe(false);
  });

  it("should calculate stats for multiple uploads", () => {
    const uploads: UploadItem[] = [
      {
        id: "1",
        file: new File(["x".repeat(100)], "file1.txt"),
        status: "success",
        progress: 100,
        bytesUploaded: 100,
        totalBytes: 100,
      },
      {
        id: "2",
        file: new File(["x".repeat(200)], "file2.txt"),
        status: "uploading",
        progress: 50,
        bytesUploaded: 100,
        totalBytes: 200,
      },
      {
        id: "3",
        file: new File(["x".repeat(100)], "file3.txt"),
        status: "error",
        progress: 0,
        bytesUploaded: 0,
        totalBytes: 100,
        error: new Error("Failed"),
      },
    ];

    const stats = calculateMultiUploadStats(uploads);
    expect(stats.totalFiles).toBe(3);
    expect(stats.completedFiles).toBe(1);
    expect(stats.failedFiles).toBe(1);
    expect(stats.totalBytes).toBe(400);
    expect(stats.uploadedBytes).toBe(200);
    expect(stats.totalProgress).toBe(50);
    expect(stats.allComplete).toBe(false);
    expect(stats.hasErrors).toBe(true);
  });

  it("should report allComplete when all uploads succeed", () => {
    const uploads: UploadItem[] = [
      {
        id: "1",
        file: new File(["x".repeat(100)], "file1.txt"),
        status: "success",
        progress: 100,
        bytesUploaded: 100,
        totalBytes: 100,
      },
      {
        id: "2",
        file: new File(["x".repeat(100)], "file2.txt"),
        status: "success",
        progress: 100,
        bytesUploaded: 100,
        totalBytes: 100,
      },
    ];

    const stats = calculateMultiUploadStats(uploads);
    expect(stats.allComplete).toBe(true);
    expect(stats.hasErrors).toBe(false);
  });
});
