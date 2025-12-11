import { describe, expect, it } from "vitest";
import { buildFlowInputs, buildSingleFlowInput } from "../flow-inputs-builder";

describe("buildFlowInputs", () => {
  const storageId = "test-storage";

  describe("File/Blob inputs", () => {
    it("builds init operation for File input", () => {
      const file = new File(["content"], "test.txt", { type: "text/plain" });
      const result = buildFlowInputs({ "file-node": file }, storageId);

      expect(result).toEqual({
        "file-node": {
          operation: "init",
          storageId: "test-storage",
          metadata: {
            originalName: "test.txt",
            mimeType: "text/plain",
            size: 7, // "content" is 7 bytes
          },
        },
      });
    });

    it("builds init operation for Blob input", () => {
      const blob = new Blob(["content"], { type: "application/json" });
      const result = buildFlowInputs({ "blob-node": blob }, storageId);

      expect(result["blob-node"]).toMatchObject({
        operation: "init",
        storageId: "test-storage",
        metadata: {
          mimeType: "application/json",
          size: 7,
        },
      });
    });

    it("handles File without name", () => {
      const file = new File(["content"], "", { type: "text/plain" });
      const result = buildFlowInputs({ node: file }, storageId);

      expect(result["node"]).toMatchObject({
        metadata: {
          originalName: "",
        },
      });
    });

    it("handles File without type", () => {
      const file = new File(["content"], "test.txt");
      const result = buildFlowInputs({ node: file }, storageId);

      expect(result["node"]).toMatchObject({
        metadata: {
          mimeType: "",
        },
      });
    });
  });

  describe("URL inputs", () => {
    it("builds url operation for https URL", () => {
      const url = "https://example.com/image.jpg";
      const result = buildFlowInputs({ "url-node": url }, storageId);

      expect(result).toEqual({
        "url-node": {
          operation: "url",
          url: "https://example.com/image.jpg",
          storageId: "test-storage",
        },
      });
    });

    it("builds url operation for http URL", () => {
      const url = "http://example.com/file.pdf";
      const result = buildFlowInputs({ "url-node": url }, storageId);

      expect(result).toEqual({
        "url-node": {
          operation: "url",
          url: "http://example.com/file.pdf",
          storageId: "test-storage",
        },
      });
    });

    it("builds url operation for URL with query params", () => {
      const url = "https://example.com/image.jpg?size=large&format=webp";
      const result = buildFlowInputs({ "url-node": url }, storageId);

      expect(result["url-node"]).toMatchObject({
        operation: "url",
        url: url,
      });
    });
  });

  describe("Structured data inputs", () => {
    it("passes through object data unchanged", () => {
      const data = { customField: "value", nested: { key: 123 } };
      const result = buildFlowInputs({ "data-node": data }, storageId);

      expect(result).toEqual({
        "data-node": { customField: "value", nested: { key: 123 } },
      });
    });

    it("passes through array data unchanged", () => {
      const data = [1, 2, 3];
      const result = buildFlowInputs({ "data-node": data }, storageId);

      expect(result).toEqual({
        "data-node": [1, 2, 3],
      });
    });

    it("passes through string (non-URL) unchanged", () => {
      const data = "plain text";
      const result = buildFlowInputs({ "data-node": data }, storageId);

      expect(result).toEqual({
        "data-node": "plain text",
      });
    });

    it("passes through number unchanged", () => {
      const data = 42;
      const result = buildFlowInputs({ "data-node": data }, storageId);

      expect(result).toEqual({
        "data-node": 42,
      });
    });

    it("passes through null unchanged", () => {
      const data = null;
      const result = buildFlowInputs({ "data-node": data }, storageId);

      expect(result).toEqual({
        "data-node": null,
      });
    });
  });

  describe("Multiple inputs", () => {
    it("handles two file inputs", () => {
      const file1 = new File(["content1"], "file1.txt");
      const file2 = new File(["content2"], "file2.txt");
      const result = buildFlowInputs({ node1: file1, node2: file2 }, storageId);

      expect(result["node1"]).toMatchObject({
        operation: "init",
        metadata: { originalName: "file1.txt" },
      });
      expect(result["node2"]).toMatchObject({
        operation: "init",
        metadata: { originalName: "file2.txt" },
      });
    });

    it("handles mixed input types (file + URL)", () => {
      const file = new File(["content"], "test.txt");
      const url = "https://example.com/image.jpg";
      const result = buildFlowInputs(
        { "file-node": file, "url-node": url },
        storageId,
      );

      expect(result["file-node"]).toMatchObject({
        operation: "init",
      });
      expect(result["url-node"]).toMatchObject({
        operation: "url",
        url: url,
      });
    });

    it("handles mixed input types (file + URL + data)", () => {
      const file = new File(["content"], "test.txt");
      const url = "https://example.com/image.jpg";
      const data = { field: "value" };
      const result = buildFlowInputs(
        {
          "file-node": file,
          "url-node": url,
          "data-node": data,
        },
        storageId,
      );

      expect(result["file-node"]).toMatchObject({ operation: "init" });
      expect(result["url-node"]).toMatchObject({ operation: "url" });
      expect(result["data-node"]).toEqual({ field: "value" });
    });
  });

  describe("Edge cases", () => {
    it("handles empty inputs object", () => {
      const result = buildFlowInputs({}, storageId);
      expect(result).toEqual({});
    });

    it("uses provided storageId for file operations", () => {
      const file = new File(["content"], "test.txt");
      const result = buildFlowInputs({ node: file }, "custom-storage");

      expect(result["node"]).toMatchObject({
        storageId: "custom-storage",
      });
    });

    it("uses provided storageId for URL operations", () => {
      const url = "https://example.com/file.jpg";
      const result = buildFlowInputs({ node: url }, "custom-storage");

      expect(result["node"]).toMatchObject({
        storageId: "custom-storage",
      });
    });
  });
});

describe("buildSingleFlowInput", () => {
  const storageId = "test-storage";

  it("builds FlowInputs for single file input", () => {
    const file = new File(["content"], "test.txt");
    const result = buildSingleFlowInput("file-node", file, storageId);

    expect(result).toEqual({
      "file-node": {
        operation: "init",
        storageId: "test-storage",
        metadata: {
          originalName: "test.txt",
          mimeType: "",
          size: 7,
        },
      },
    });
  });

  it("builds FlowInputs for single URL input", () => {
    const url = "https://example.com/image.jpg";
    const result = buildSingleFlowInput("url-node", url, storageId);

    expect(result).toEqual({
      "url-node": {
        operation: "url",
        url: "https://example.com/image.jpg",
        storageId: "test-storage",
      },
    });
  });

  it("builds FlowInputs for single data input", () => {
    const data = { field: "value" };
    const result = buildSingleFlowInput("data-node", data, storageId);

    expect(result).toEqual({
      "data-node": { field: "value" },
    });
  });
});
