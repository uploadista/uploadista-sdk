import { describe, expect, it, vi } from "vitest";
import { createBrowserPlatformService } from "./platform-service";

describe("createBrowserPlatformService", () => {
  it("should create a platform service", () => {
    const service = createBrowserPlatformService();
    expect(service).toBeDefined();
    expect(service.setTimeout).toBeDefined();
    expect(service.clearTimeout).toBeDefined();
    expect(service.isBrowser).toBeDefined();
    expect(service.isOnline).toBeDefined();
    expect(service.isFileLike).toBeDefined();
    expect(service.getFileName).toBeDefined();
    expect(service.getFileType).toBeDefined();
    expect(service.getFileSize).toBeDefined();
    expect(service.getFileLastModified).toBeDefined();
  });

  describe("setTimeout", () => {
    it("should schedule a callback", async () => {
      const service = createBrowserPlatformService();
      const callback = vi.fn();

      service.setTimeout(callback, 10);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(callback).toHaveBeenCalled();
    });

    it("should return a timeout ID", () => {
      const service = createBrowserPlatformService();
      const callback = vi.fn();

      const id = service.setTimeout(callback, 1000);
      expect(id).toBeDefined();

      // Clean up
      service.clearTimeout(id);
    });
  });

  describe("clearTimeout", () => {
    it("should cancel a scheduled callback", async () => {
      const service = createBrowserPlatformService();
      const callback = vi.fn();

      const id = service.setTimeout(callback, 50);
      service.clearTimeout(id);

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("isBrowser", () => {
    it("should return true in browser environment", () => {
      const service = createBrowserPlatformService();
      // In happy-dom test environment, window should be defined
      expect(service.isBrowser()).toBe(true);
    });
  });

  describe("isOnline", () => {
    it("should return online status", () => {
      const service = createBrowserPlatformService();
      // In happy-dom, navigator.onLine should be available
      const result = service.isOnline();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("isFileLike", () => {
    it("should return true for File objects", () => {
      const service = createBrowserPlatformService();
      const file = new File(["content"], "test.txt", { type: "text/plain" });

      expect(service.isFileLike(file)).toBe(true);
    });

    it("should return false for Blob objects", () => {
      const service = createBrowserPlatformService();
      const blob = new Blob(["content"], { type: "text/plain" });

      expect(service.isFileLike(blob)).toBe(false);
    });

    it("should return false for non-file values", () => {
      const service = createBrowserPlatformService();

      expect(service.isFileLike("string")).toBe(false);
      expect(service.isFileLike(123)).toBe(false);
      expect(service.isFileLike(null)).toBe(false);
      expect(service.isFileLike(undefined)).toBe(false);
      expect(service.isFileLike({})).toBe(false);
    });
  });

  describe("getFileName", () => {
    it("should return file name for File objects", () => {
      const service = createBrowserPlatformService();
      const file = new File(["content"], "test.txt", { type: "text/plain" });

      expect(service.getFileName(file)).toBe("test.txt");
    });

    it("should return undefined for non-File objects", () => {
      const service = createBrowserPlatformService();
      const blob = new Blob(["content"], { type: "text/plain" });

      expect(service.getFileName(blob)).toBeUndefined();
      expect(service.getFileName("string")).toBeUndefined();
      expect(service.getFileName(null)).toBeUndefined();
    });
  });

  describe("getFileType", () => {
    it("should return file type for File objects", () => {
      const service = createBrowserPlatformService();
      const file = new File(["content"], "test.txt", { type: "text/plain" });

      expect(service.getFileType(file)).toBe("text/plain");
    });

    it("should return undefined for non-File objects", () => {
      const service = createBrowserPlatformService();
      const blob = new Blob(["content"], { type: "text/plain" });

      expect(service.getFileType(blob)).toBeUndefined();
      expect(service.getFileType("string")).toBeUndefined();
    });
  });

  describe("getFileSize", () => {
    it("should return file size for File objects", () => {
      const service = createBrowserPlatformService();
      const content = "Hello, World!";
      const file = new File([content], "test.txt", { type: "text/plain" });

      expect(service.getFileSize(file)).toBe(content.length);
    });

    it("should return undefined for non-File objects", () => {
      const service = createBrowserPlatformService();
      const blob = new Blob(["content"], { type: "text/plain" });

      expect(service.getFileSize(blob)).toBeUndefined();
      expect(service.getFileSize("string")).toBeUndefined();
    });
  });

  describe("getFileLastModified", () => {
    it("should return last modified for File objects", () => {
      const service = createBrowserPlatformService();
      const file = new File(["content"], "test.txt", { type: "text/plain" });

      const lastModified = service.getFileLastModified(file);
      expect(typeof lastModified).toBe("number");
      expect(lastModified).toBeGreaterThan(0);
    });

    it("should return undefined for non-File objects", () => {
      const service = createBrowserPlatformService();
      const blob = new Blob(["content"], { type: "text/plain" });

      expect(service.getFileLastModified(blob)).toBeUndefined();
      expect(service.getFileLastModified("string")).toBeUndefined();
    });
  });
});
