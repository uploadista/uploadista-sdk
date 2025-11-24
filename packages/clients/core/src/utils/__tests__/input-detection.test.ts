import { describe, expect, it } from "vitest";
import { detectInputType, isFileOrBlob, isURL } from "../input-detection";

describe("detectInputType", () => {
  it("detects File as 'file' type", () => {
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    expect(detectInputType(file)).toBe("file");
  });

  it("detects Blob as 'file' type", () => {
    const blob = new Blob(["content"], { type: "text/plain" });
    expect(detectInputType(blob)).toBe("file");
  });

  it("detects https URL as 'url' type", () => {
    expect(detectInputType("https://example.com/image.jpg")).toBe("url");
  });

  it("detects http URL as 'url' type", () => {
    expect(detectInputType("http://example.com/image.jpg")).toBe("url");
  });

  it("detects URL with query params as 'url' type", () => {
    expect(detectInputType("https://example.com/image.jpg?size=large")).toBe(
      "url",
    );
  });

  it("detects plain string as 'data' type", () => {
    expect(detectInputType("not a url")).toBe("data");
  });

  it("detects object as 'data' type", () => {
    expect(detectInputType({ field: "value" })).toBe("data");
  });

  it("detects array as 'data' type", () => {
    expect(detectInputType([1, 2, 3])).toBe("data");
  });

  it("detects null as 'data' type", () => {
    expect(detectInputType(null)).toBe("data");
  });

  it("detects undefined as 'data' type", () => {
    expect(detectInputType(undefined)).toBe("data");
  });

  it("detects number as 'data' type", () => {
    expect(detectInputType(123)).toBe("data");
  });
});

describe("isURL", () => {
  it("returns true for https URL", () => {
    expect(isURL("https://example.com/file.jpg")).toBe(true);
  });

  it("returns true for http URL", () => {
    expect(isURL("http://example.com/file.jpg")).toBe(true);
  });

  it("returns true for URL with path and query", () => {
    expect(isURL("https://example.com/path/to/file.jpg?param=value")).toBe(
      true,
    );
  });

  it("returns false for plain string", () => {
    expect(isURL("not a url")).toBe(false);
  });

  it("returns false for object", () => {
    expect(isURL({ url: "https://example.com" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isURL(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isURL(undefined)).toBe(false);
  });

  it("returns false for relative URL", () => {
    expect(isURL("/path/to/file.jpg")).toBe(false);
  });

  it("returns false for ftp URL", () => {
    expect(isURL("ftp://example.com/file.jpg")).toBe(false);
  });
});

describe("isFileOrBlob", () => {
  it("returns true for File", () => {
    const file = new File(["content"], "test.txt");
    expect(isFileOrBlob(file)).toBe(true);
  });

  it("returns true for Blob", () => {
    const blob = new Blob(["content"]);
    expect(isFileOrBlob(blob)).toBe(true);
  });

  it("returns false for string", () => {
    expect(isFileOrBlob("not a file")).toBe(false);
  });

  it("returns false for object", () => {
    expect(isFileOrBlob({ name: "file.txt" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isFileOrBlob(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isFileOrBlob(undefined)).toBe(false);
  });
});
