import { describe, expect, it } from "vitest";
import { createBrowserFileReaderService } from "./file-reader";

describe("createBrowserFileReaderService", () => {
  it("should create a file reader service", () => {
    const service = createBrowserFileReaderService();
    expect(service).toBeDefined();
    expect(service.openFile).toBeDefined();
    expect(typeof service.openFile).toBe("function");
  });

  describe("openFile", () => {
    it("should open a File object", async () => {
      const service = createBrowserFileReaderService();
      const file = new File(["Hello, World!"], "test.txt", {
        type: "text/plain",
      });

      const source = await service.openFile(file, 1024);

      expect(source).toBeDefined();
      expect(source.input).toBe(file);
      expect(source.size).toBe(file.size);
      expect(source.name).toBe("test.txt");
      expect(source.type).toBe("text/plain");
      expect(source.lastModified).toBeDefined();
    });

    it("should open a Blob object", async () => {
      const service = createBrowserFileReaderService();
      const blob = new Blob(["Hello, World!"], { type: "text/plain" });

      const source = await service.openFile(blob, 1024);

      expect(source).toBeDefined();
      expect(source.input).toBe(blob);
      expect(source.size).toBe(blob.size);
      expect(source.name).toBeNull();
      expect(source.type).toBeNull();
      expect(source.lastModified).toBeNull();
    });

    it("should throw for invalid input", async () => {
      const service = createBrowserFileReaderService();

      await expect(
        service.openFile("invalid" as unknown as Blob, 1024),
      ).rejects.toThrow("source object may only be an instance of File, Blob");
    });
  });

  describe("FileSource", () => {
    describe("slice", () => {
      it("should read a slice of data", async () => {
        const service = createBrowserFileReaderService();
        const content = "Hello, World!";
        const file = new File([content], "test.txt", { type: "text/plain" });

        const source = await service.openFile(file, 1024);
        const result = await source.slice(0, 5);

        expect(result.value).toBeInstanceOf(Uint8Array);
        expect(result.size).toBe(5);
        expect(result.done).toBe(false);

        // Verify content
        const text = new TextDecoder().decode(result.value);
        expect(text).toBe("Hello");
      });

      it("should read the entire file", async () => {
        const service = createBrowserFileReaderService();
        const content = "Hello";
        const file = new File([content], "test.txt", { type: "text/plain" });

        const source = await service.openFile(file, 1024);
        const result = await source.slice(0, file.size);

        expect(result.value).toBeInstanceOf(Uint8Array);
        expect(result.size).toBe(5);
        expect(result.done).toBe(true);

        const text = new TextDecoder().decode(result.value);
        expect(text).toBe("Hello");
      });

      it("should read from middle of file", async () => {
        const service = createBrowserFileReaderService();
        const content = "Hello, World!";
        const file = new File([content], "test.txt", { type: "text/plain" });

        const source = await service.openFile(file, 1024);
        const result = await source.slice(7, 12);

        const text = new TextDecoder().decode(result.value);
        expect(text).toBe("World");
      });

      it("should handle empty slice", async () => {
        const service = createBrowserFileReaderService();
        const content = "Hello";
        const file = new File([content], "test.txt", { type: "text/plain" });

        const source = await service.openFile(file, 1024);
        const result = await source.slice(0, 0);

        expect(result.size).toBe(0);
      });

      it("should handle binary data", async () => {
        const service = createBrowserFileReaderService();
        const binaryData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        const blob = new Blob([binaryData], {
          type: "application/octet-stream",
        });

        const source = await service.openFile(blob, 1024);
        const result = await source.slice(0, 5);

        expect(result.value).toEqual(new Uint8Array([0, 1, 2, 3, 4]));
      });
    });

    describe("close", () => {
      it("should not throw when closing", async () => {
        const service = createBrowserFileReaderService();
        const file = new File(["Hello"], "test.txt", { type: "text/plain" });

        const source = await service.openFile(file, 1024);

        expect(() => source.close()).not.toThrow();
      });
    });
  });

  describe("chunked reading", () => {
    it("should read file in chunks", async () => {
      const service = createBrowserFileReaderService();
      const content = "ABCDEFGHIJ"; // 10 bytes
      const file = new File([content], "test.txt", { type: "text/plain" });
      const chunkSize = 3;

      const source = await service.openFile(file, chunkSize);
      const chunks: Uint8Array[] = [];
      let offset = 0;

      while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size);
        const result = await source.slice(offset, end);
        chunks.push(result.value);
        offset = end;

        if (result.done) break;
      }

      // Should have 4 chunks: ABC, DEF, GHI, J
      expect(chunks).toHaveLength(4);

      // Verify combined content
      const combined = new Uint8Array(
        chunks.reduce((acc, chunk) => acc + chunk.length, 0),
      );
      let pos = 0;
      for (const chunk of chunks) {
        combined.set(chunk, pos);
        pos += chunk.length;
      }

      const text = new TextDecoder().decode(combined);
      expect(text).toBe(content);
    });
  });
});
