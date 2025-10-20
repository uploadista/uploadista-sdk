import { describe, expect, it } from "vitest";
import {
  calcOffsetFromParts,
  calcOptimalPartSize,
  getExpirationDate,
  partKey,
  shouldUseExpirationTags,
} from "../utils/calculations";

describe("Multipart Upload Logic", () => {
  describe("calcOffsetFromParts", () => {
    it("should calculate offset from empty parts list", () => {
      expect(calcOffsetFromParts([])).toBe(0);
      expect(calcOffsetFromParts(undefined)).toBe(0);
    });

    it("should calculate offset from single part", () => {
      const parts = [{ Size: 1024 }];
      expect(calcOffsetFromParts(parts)).toBe(1024);
    });

    it("should calculate offset from multiple parts", () => {
      const parts = [{ Size: 1024 }, { Size: 2048 }, { Size: 512 }];
      expect(calcOffsetFromParts(parts)).toBe(3584);
    });

    it("should handle parts with undefined sizes", () => {
      const parts = [{ Size: 1024 }, { Size: undefined }, { Size: 512 }];
      expect(calcOffsetFromParts(parts)).toBe(1536);
    });

    it("should handle parts with mixed sizes", () => {
      const parts = [
        { Size: 5 * 1024 * 1024 }, // 5MB
        { Size: 8 * 1024 * 1024 }, // 8MB
        { Size: 3 * 1024 * 1024 }, // 3MB
      ];
      expect(calcOffsetFromParts(parts)).toBe(16 * 1024 * 1024); // 16MB
    });
  });

  describe("calcOptimalPartSize", () => {
    const minPartSize = 5 * 1024 * 1024; // 5MB
    const preferredPartSize = 8 * 1024 * 1024; // 8MB
    const maxMultipartParts = 10000;

    it("should handle undefined file size", () => {
      const partSize = calcOptimalPartSize(
        undefined,
        preferredPartSize,
        minPartSize,
        maxMultipartParts,
      );

      // Should use a size that works with the maximum upload size
      expect(partSize).toBeGreaterThanOrEqual(minPartSize);
    });

    it("should use file size for small files", () => {
      const fileSize = 1 * 1024 * 1024; // 1MB
      const partSize = calcOptimalPartSize(
        fileSize,
        preferredPartSize,
        minPartSize,
        maxMultipartParts,
      );

      // For small files, should align to reasonable boundary but stay small
      expect(partSize).toBeLessThanOrEqual(preferredPartSize);
      expect(partSize % 1024).toBe(0); // Should be aligned to 1KB boundaries
    });

    it("should use preferred part size for medium files", () => {
      const fileSize = 50 * 1024 * 1024; // 50MB
      const partSize = calcOptimalPartSize(
        fileSize,
        preferredPartSize,
        minPartSize,
        maxMultipartParts,
      );

      expect(partSize).toBe(preferredPartSize);
    });

    it("should adjust part size for very large files", () => {
      const fileSize = 100 * 1024 * 1024 * 1024; // 100GB
      const partSize = calcOptimalPartSize(
        fileSize,
        preferredPartSize,
        minPartSize,
        maxMultipartParts,
      );

      // Should be larger than preferred to stay within part limits
      expect(partSize).toBeGreaterThan(preferredPartSize);

      // Should not exceed part count limit
      const estimatedParts = Math.ceil(fileSize / partSize);
      expect(estimatedParts).toBeLessThanOrEqual(maxMultipartParts);
    });

    it("should respect minimum part size for multipart uploads", () => {
      const fileSize = 20 * 1024 * 1024; // 20MB
      const smallPreferredSize = 1 * 1024 * 1024; // 1MB (below S3 minimum)

      const partSize = calcOptimalPartSize(
        fileSize,
        smallPreferredSize,
        minPartSize,
        maxMultipartParts,
      );

      expect(partSize).toBeGreaterThanOrEqual(minPartSize);
    });

    it("should handle edge case at part limit boundary", () => {
      // File size that would require exactly max parts with preferred size
      const fileSize = preferredPartSize * maxMultipartParts;

      const partSize = calcOptimalPartSize(
        fileSize,
        preferredPartSize,
        minPartSize,
        maxMultipartParts,
      );

      expect(partSize).toBe(preferredPartSize);

      const estimatedParts = Math.ceil(fileSize / partSize);
      expect(estimatedParts).toBe(maxMultipartParts);
    });

    it("should handle file size just over part limit boundary", () => {
      // File size that would require one more than max parts with preferred size
      const fileSize = preferredPartSize * maxMultipartParts + 1;

      const partSize = calcOptimalPartSize(
        fileSize,
        preferredPartSize,
        minPartSize,
        maxMultipartParts,
      );

      expect(partSize).toBeGreaterThan(preferredPartSize);

      const estimatedParts = Math.ceil(fileSize / partSize);
      expect(estimatedParts).toBeLessThanOrEqual(maxMultipartParts);
    });

    it("should align part sizes to 1KB boundaries", () => {
      const fileSizes = [
        13 * 1024 * 1024 + 500, // 13.5MB + some bytes
        25 * 1024 * 1024 + 777, // 25MB + some bytes
        100 * 1024 * 1024 + 123, // 100MB + some bytes
      ];

      fileSizes.forEach((fileSize) => {
        const partSize = calcOptimalPartSize(
          fileSize,
          preferredPartSize,
          minPartSize,
          maxMultipartParts,
        );

        expect(partSize % 1024).toBe(0); // Should be aligned to 1KB
      });
    });

    it("should handle maximum upload size", () => {
      const maxUploadSize = 5 * 1024 * 1024 * 1024 * 1024; // 5TB

      const partSize = calcOptimalPartSize(
        maxUploadSize,
        preferredPartSize,
        minPartSize,
        maxMultipartParts,
      );

      expect(partSize).toBeGreaterThanOrEqual(minPartSize);

      const estimatedParts = Math.ceil(maxUploadSize / partSize);
      expect(estimatedParts).toBeLessThanOrEqual(maxMultipartParts);
    });
  });

  describe("partKey", () => {
    it("should generate consistent part keys", () => {
      expect(partKey("test-upload-id")).toBe("test-upload-id.part");
      expect(partKey("upload-123")).toBe("upload-123.part");
      expect(partKey("")).toBe(".part");
    });

    it("should handle special characters in upload IDs", () => {
      expect(partKey("upload-with-dashes")).toBe("upload-with-dashes.part");
      expect(partKey("upload_with_underscores")).toBe(
        "upload_with_underscores.part",
      );
      expect(partKey("upload.with.dots")).toBe("upload.with.dots.part");
    });
  });

  describe("shouldUseExpirationTags", () => {
    it("should return false when expiration is disabled", () => {
      expect(shouldUseExpirationTags(0, true)).toBe(false);
      expect(shouldUseExpirationTags(0, false)).toBe(false);
    });

    it("should return false when tags are disabled", () => {
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      expect(shouldUseExpirationTags(oneWeek, false)).toBe(false);
    });

    it("should return true when both expiration and tags are enabled", () => {
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      expect(shouldUseExpirationTags(oneWeek, true)).toBe(true);

      const oneDay = 24 * 60 * 60 * 1000;
      expect(shouldUseExpirationTags(oneDay, true)).toBe(true);
    });
  });

  describe("getExpirationDate", () => {
    it("should calculate expiration date correctly", () => {
      const createdAt = "2023-01-01T00:00:00.000Z";
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      const expirationDate = getExpirationDate(createdAt, oneWeek);

      expect(expirationDate.getTime()).toBe(
        new Date(createdAt).getTime() + oneWeek,
      );
    });

    it("should handle different date formats", () => {
      const formats = [
        "2023-01-01T00:00:00.000Z",
        "2023-01-01T12:30:45.123Z",
        "2023-12-31T23:59:59.999Z",
      ];

      const oneDay = 24 * 60 * 60 * 1000;

      formats.forEach((dateStr) => {
        const originalDate = new Date(dateStr);
        const expirationDate = getExpirationDate(dateStr, oneDay);

        expect(expirationDate.getTime()).toBe(originalDate.getTime() + oneDay);
      });
    });

    it("should handle different expiration periods", () => {
      const createdAt = "2023-06-15T10:30:00.000Z";
      const baseTime = new Date(createdAt).getTime();

      const periods = {
        oneHour: 60 * 60 * 1000,
        oneDay: 24 * 60 * 60 * 1000,
        oneWeek: 7 * 24 * 60 * 60 * 1000,
        oneMonth: 30 * 24 * 60 * 60 * 1000,
      };

      Object.entries(periods).forEach(([_name, period]) => {
        const expirationDate = getExpirationDate(createdAt, period);
        expect(expirationDate.getTime()).toBe(baseTime + period);
      });
    });

    it("should handle zero expiration period", () => {
      const createdAt = "2023-01-01T00:00:00.000Z";
      const expirationDate = getExpirationDate(createdAt, 0);

      expect(expirationDate.getTime()).toBe(new Date(createdAt).getTime());
    });

    it("should handle very large expiration periods", () => {
      const createdAt = "2023-01-01T00:00:00.000Z";
      const oneYear = 365 * 24 * 60 * 60 * 1000;

      const expirationDate = getExpirationDate(createdAt, oneYear);

      expect(expirationDate.getTime()).toBe(
        new Date(createdAt).getTime() + oneYear,
      );
      expect(expirationDate.getFullYear()).toBe(2024);
    });
  });

  describe("Real-world scenarios", () => {
    const minPartSize = 5 * 1024 * 1024; // 5MB
    const preferredPartSize = 8 * 1024 * 1024; // 8MB
    const maxMultipartParts = 10000;

    it("should handle typical video file upload (1GB)", () => {
      const fileSize = 1024 * 1024 * 1024; // 1GB
      const partSize = calcOptimalPartSize(
        fileSize,
        preferredPartSize,
        minPartSize,
        maxMultipartParts,
      );

      expect(partSize).toBe(preferredPartSize); // Should use preferred 8MB

      const parts = Math.ceil(fileSize / partSize);
      expect(parts).toBeLessThanOrEqual(maxMultipartParts);
      expect(parts).toBe(128); // 1GB / 8MB = 128 parts
    });

    it("should handle large backup file (500GB)", () => {
      const fileSize = 500 * 1024 * 1024 * 1024; // 500GB
      const partSize = calcOptimalPartSize(
        fileSize,
        preferredPartSize,
        minPartSize,
        maxMultipartParts,
      );

      // Should be larger than preferred to stay within part limits
      expect(partSize).toBeGreaterThan(preferredPartSize);

      const parts = Math.ceil(fileSize / partSize);
      expect(parts).toBeLessThanOrEqual(maxMultipartParts);

      // Calculate expected part size
      const expectedMinPartSize = Math.ceil(fileSize / maxMultipartParts);
      expect(partSize).toBeGreaterThanOrEqual(expectedMinPartSize);
    });

    it("should handle edge case: exactly 5GB file with 5MB parts", () => {
      const fileSize = 5 * 1024 * 1024 * 1024; // 5GB
      const smallPreferredSize = 5 * 1024 * 1024; // 5MB

      const partSize = calcOptimalPartSize(
        fileSize,
        smallPreferredSize,
        minPartSize,
        maxMultipartParts,
      );

      expect(partSize).toBe(smallPreferredSize); // Should use 5MB

      const parts = Math.ceil(fileSize / partSize);
      expect(parts).toBe(1024); // 5GB / 5MB = 1024 parts
      expect(parts).toBeLessThanOrEqual(maxMultipartParts);
    });

    it("should optimize for files that exceed part count limits", () => {
      // File that would require 20,000 parts with 8MB parts
      const fileSize = 20000 * preferredPartSize;

      const partSize = calcOptimalPartSize(
        fileSize,
        preferredPartSize,
        minPartSize,
        maxMultipartParts,
      );

      // Should be larger than preferred to fit within limit
      expect(partSize).toBeGreaterThan(preferredPartSize);

      const parts = Math.ceil(fileSize / partSize);
      expect(parts).toBeLessThanOrEqual(maxMultipartParts);

      // Should be close to the limit but not exceed it
      expect(parts).toBeGreaterThan(maxMultipartParts * 0.9); // At least 90% of limit used
    });

    it("should handle small files efficiently", () => {
      const smallSizes = [
        1024, // 1KB
        100 * 1024, // 100KB
        1024 * 1024, // 1MB
        4.9 * 1024 * 1024, // 4.9MB (just under S3 minimum)
      ];

      smallSizes.forEach((fileSize) => {
        const partSize = calcOptimalPartSize(
          fileSize,
          preferredPartSize,
          minPartSize,
          maxMultipartParts,
        );

        if (fileSize < minPartSize) {
          // For small files, part size should be small but aligned
          expect(partSize).toBeLessThan(minPartSize);
          expect(partSize % 1024).toBe(0); // 1KB aligned
        } else {
          // For files at or above minimum, should respect minimum
          expect(partSize).toBeGreaterThanOrEqual(minPartSize);
        }
      });
    });
  });
});
