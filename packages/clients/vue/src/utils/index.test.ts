import { describe, expect, it } from "vitest";
import {
  createMockFile,
  mockCreateObjectURL,
  mockRevokeObjectURL,
} from "../__tests__/setup";
import {
  calculateProgress,
  createFilePreview,
  formatDuration,
  formatFileSize,
  formatSpeed,
  generateUploadId,
  getFileExtension,
  isAudioFile,
  isDocumentFile,
  isImageFile,
  isVideoFile,
  revokeFilePreview,
  validateFileType,
} from "./index";

describe("formatFileSize", () => {
  it("should format 0 bytes", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
  });

  it("should format bytes", () => {
    expect(formatFileSize(500)).toBe("500 Bytes");
  });

  it("should format kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("should format megabytes", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1 MB");
    expect(formatFileSize(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });

  it("should format gigabytes", () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
  });

  it("should format terabytes", () => {
    expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe("1 TB");
  });
});

describe("formatSpeed", () => {
  it("should format 0 B/s", () => {
    expect(formatSpeed(0)).toBe("0 B/s");
  });

  it("should format bytes per second", () => {
    expect(formatSpeed(500)).toBe("500 B/s");
  });

  it("should format kilobytes per second", () => {
    expect(formatSpeed(1024)).toBe("1 KB/s");
  });

  it("should format megabytes per second", () => {
    expect(formatSpeed(1024 * 1024)).toBe("1 MB/s");
  });

  it("should format gigabytes per second", () => {
    expect(formatSpeed(1024 * 1024 * 1024)).toBe("1 GB/s");
  });
});

describe("formatDuration", () => {
  it("should format milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("should format seconds", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(30000)).toBe("30s");
    expect(formatDuration(59999)).toBe("60s");
  });

  it("should format minutes", () => {
    expect(formatDuration(60000)).toBe("1m");
    expect(formatDuration(90000)).toBe("1m 30s");
    expect(formatDuration(120000)).toBe("2m");
  });

  it("should format hours", () => {
    expect(formatDuration(3600000)).toBe("1h");
    expect(formatDuration(3600000 + 1800000)).toBe("1h 30m");
    expect(formatDuration(7200000)).toBe("2h");
  });
});

describe("validateFileType", () => {
  it("should return true when accept is empty", () => {
    const file = createMockFile("test.txt", 100, "text/plain");
    expect(validateFileType(file, [])).toBe(true);
  });

  it("should validate by file extension", () => {
    const txtFile = createMockFile("test.txt", 100, "text/plain");
    const pdfFile = createMockFile("doc.pdf", 100, "application/pdf");

    expect(validateFileType(txtFile, [".txt"])).toBe(true);
    expect(validateFileType(txtFile, [".pdf"])).toBe(false);
    expect(validateFileType(pdfFile, [".pdf", ".doc"])).toBe(true);
  });

  it("should validate by exact MIME type", () => {
    const file = createMockFile("test.txt", 100, "text/plain");

    expect(validateFileType(file, ["text/plain"])).toBe(true);
    expect(validateFileType(file, ["application/json"])).toBe(false);
  });

  it("should validate by wildcard MIME type", () => {
    const imageFile = createMockFile("photo.jpg", 100, "image/jpeg");
    const videoFile = createMockFile("video.mp4", 100, "video/mp4");

    expect(validateFileType(imageFile, ["image/*"])).toBe(true);
    expect(validateFileType(imageFile, ["video/*"])).toBe(false);
    expect(validateFileType(videoFile, ["video/*"])).toBe(true);
  });

  it("should validate with mixed accept types", () => {
    const imageFile = createMockFile("photo.jpg", 100, "image/jpeg");
    const pdfFile = createMockFile("doc.pdf", 100, "application/pdf");

    expect(validateFileType(imageFile, ["image/*", ".pdf"])).toBe(true);
    expect(validateFileType(pdfFile, ["image/*", ".pdf"])).toBe(true);
  });

  it("should be case-insensitive for file extensions", () => {
    const file = createMockFile("TEST.TXT", 100, "text/plain");
    expect(validateFileType(file, [".txt"])).toBe(true);
  });
});

describe("generateUploadId", () => {
  it("should generate unique IDs", () => {
    const id1 = generateUploadId();
    const id2 = generateUploadId();

    expect(id1).not.toBe(id2);
  });

  it("should start with 'upload-'", () => {
    const id = generateUploadId();
    expect(id).toMatch(/^upload-/);
  });

  it("should contain timestamp and random string", () => {
    const id = generateUploadId();
    expect(id).toMatch(/^upload-\d+-[a-z0-9]+$/);
  });
});

describe("getFileExtension", () => {
  it("should extract file extension", () => {
    expect(getFileExtension("file.txt")).toBe("txt");
    expect(getFileExtension("image.jpeg")).toBe("jpeg");
    expect(getFileExtension("document.pdf")).toBe("pdf");
  });

  it("should return lowercase extension", () => {
    expect(getFileExtension("FILE.TXT")).toBe("txt");
    expect(getFileExtension("Image.JPEG")).toBe("jpeg");
  });

  it("should handle files with multiple dots", () => {
    expect(getFileExtension("archive.tar.gz")).toBe("gz");
    expect(getFileExtension("my.file.name.txt")).toBe("txt");
  });

  it("should return empty string for files without extension", () => {
    expect(getFileExtension("noextension")).toBe("");
    expect(getFileExtension("Makefile")).toBe("");
  });
});

describe("isImageFile", () => {
  it("should identify image files", () => {
    expect(isImageFile(createMockFile("photo.jpg", 100, "image/jpeg"))).toBe(
      true,
    );
    expect(isImageFile(createMockFile("photo.png", 100, "image/png"))).toBe(
      true,
    );
    expect(isImageFile(createMockFile("photo.gif", 100, "image/gif"))).toBe(
      true,
    );
    expect(isImageFile(createMockFile("photo.webp", 100, "image/webp"))).toBe(
      true,
    );
  });

  it("should reject non-image files", () => {
    expect(isImageFile(createMockFile("video.mp4", 100, "video/mp4"))).toBe(
      false,
    );
    expect(isImageFile(createMockFile("doc.pdf", 100, "application/pdf"))).toBe(
      false,
    );
  });
});

describe("isVideoFile", () => {
  it("should identify video files", () => {
    expect(isVideoFile(createMockFile("video.mp4", 100, "video/mp4"))).toBe(
      true,
    );
    expect(isVideoFile(createMockFile("video.webm", 100, "video/webm"))).toBe(
      true,
    );
    expect(isVideoFile(createMockFile("video.avi", 100, "video/avi"))).toBe(
      true,
    );
  });

  it("should reject non-video files", () => {
    expect(isVideoFile(createMockFile("photo.jpg", 100, "image/jpeg"))).toBe(
      false,
    );
    expect(isVideoFile(createMockFile("audio.mp3", 100, "audio/mpeg"))).toBe(
      false,
    );
  });
});

describe("isAudioFile", () => {
  it("should identify audio files", () => {
    expect(isAudioFile(createMockFile("song.mp3", 100, "audio/mpeg"))).toBe(
      true,
    );
    expect(isAudioFile(createMockFile("song.wav", 100, "audio/wav"))).toBe(
      true,
    );
    expect(isAudioFile(createMockFile("song.ogg", 100, "audio/ogg"))).toBe(
      true,
    );
  });

  it("should reject non-audio files", () => {
    expect(isAudioFile(createMockFile("video.mp4", 100, "video/mp4"))).toBe(
      false,
    );
    expect(isAudioFile(createMockFile("photo.jpg", 100, "image/jpeg"))).toBe(
      false,
    );
  });
});

describe("isDocumentFile", () => {
  it("should identify PDF files", () => {
    expect(
      isDocumentFile(createMockFile("doc.pdf", 100, "application/pdf")),
    ).toBe(true);
  });

  it("should identify Word documents", () => {
    expect(
      isDocumentFile(createMockFile("doc.doc", 100, "application/msword")),
    ).toBe(true);
    expect(
      isDocumentFile(
        createMockFile(
          "doc.docx",
          100,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
      ),
    ).toBe(true);
  });

  it("should identify Excel files", () => {
    expect(
      isDocumentFile(
        createMockFile("sheet.xls", 100, "application/vnd.ms-excel"),
      ),
    ).toBe(true);
    expect(
      isDocumentFile(
        createMockFile(
          "sheet.xlsx",
          100,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
      ),
    ).toBe(true);
  });

  it("should identify PowerPoint files", () => {
    expect(
      isDocumentFile(
        createMockFile("pres.ppt", 100, "application/vnd.ms-powerpoint"),
      ),
    ).toBe(true);
    expect(
      isDocumentFile(
        createMockFile(
          "pres.pptx",
          100,
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ),
      ),
    ).toBe(true);
  });

  it("should identify text files", () => {
    expect(
      isDocumentFile(createMockFile("readme.txt", 100, "text/plain")),
    ).toBe(true);
    expect(isDocumentFile(createMockFile("data.csv", 100, "text/csv"))).toBe(
      true,
    );
  });

  it("should identify RTF files", () => {
    expect(
      isDocumentFile(createMockFile("doc.rtf", 100, "application/rtf")),
    ).toBe(true);
  });

  it("should reject non-document files", () => {
    expect(isDocumentFile(createMockFile("photo.jpg", 100, "image/jpeg"))).toBe(
      false,
    );
    expect(isDocumentFile(createMockFile("video.mp4", 100, "video/mp4"))).toBe(
      false,
    );
  });
});

describe("createFilePreview", () => {
  it("should create preview URL for image files", () => {
    const file = createMockFile("photo.jpg", 100, "image/jpeg");
    const preview = createFilePreview(file);
    expect(preview).toBe("blob:mock-url");
    expect(mockCreateObjectURL).toHaveBeenCalledWith(file);
  });

  it("should create preview URL for video files", () => {
    const file = createMockFile("video.mp4", 100, "video/mp4");
    const preview = createFilePreview(file);
    expect(preview).toBe("blob:mock-url");
    expect(mockCreateObjectURL).toHaveBeenCalledWith(file);
  });

  it("should create preview URL for audio files", () => {
    const file = createMockFile("audio.mp3", 100, "audio/mpeg");
    const preview = createFilePreview(file);
    expect(preview).toBe("blob:mock-url");
    expect(mockCreateObjectURL).toHaveBeenCalledWith(file);
  });

  it("should return null for unsupported file types", () => {
    const file = createMockFile("doc.pdf", 100, "application/pdf");
    const preview = createFilePreview(file);
    expect(preview).toBeNull();
  });
});

describe("revokeFilePreview", () => {
  it("should call URL.revokeObjectURL", () => {
    const mockUrl = "blob:test-url";
    revokeFilePreview(mockUrl);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(mockUrl);
  });
});

describe("calculateProgress", () => {
  it("should return 0 when total is 0", () => {
    expect(calculateProgress(50, 0)).toBe(0);
  });

  it("should calculate correct percentage", () => {
    expect(calculateProgress(50, 100)).toBe(50);
    expect(calculateProgress(25, 100)).toBe(25);
    expect(calculateProgress(75, 100)).toBe(75);
  });

  it("should round to nearest integer", () => {
    expect(calculateProgress(33, 100)).toBe(33);
    expect(calculateProgress(1, 3)).toBe(33);
  });

  it("should cap at 100%", () => {
    expect(calculateProgress(150, 100)).toBe(100);
  });

  it("should not go below 0%", () => {
    expect(calculateProgress(-10, 100)).toBe(0);
  });
});
