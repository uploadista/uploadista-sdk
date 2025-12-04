import { describe, expect, it } from "vitest";

import type { UploadFile } from "../../src/types/upload-file";
import {
  AVAILABLE_TEMPLATE_VARIABLES,
  applyFileNaming,
  buildNamingContext,
  getBaseName,
  getExtension,
  interpolateFileName,
  validatePattern,
} from "../../src/flow/utils/file-naming";

// Mock UploadFile for testing
const createMockFile = (overrides?: Partial<UploadFile>): UploadFile => ({
  id: "file-123",
  offset: 0,
  storage: { id: "storage-1", type: "S3", bucket: "test-bucket" },
  size: 1024,
  url: "https://example.com/file.jpg",
  metadata: {
    fileName: "photo.jpg",
    width: 1920,
    height: 1080,
  },
  ...overrides,
});

describe("getBaseName", () => {
  it("should extract base name from filename with extension", () => {
    expect(getBaseName("photo.jpg")).toBe("photo");
    expect(getBaseName("document.pdf")).toBe("document");
    expect(getBaseName("video.mp4")).toBe("video");
  });

  it("should handle multiple dots in filename", () => {
    expect(getBaseName("document.tar.gz")).toBe("document.tar");
    expect(getBaseName("file.name.with.dots.txt")).toBe("file.name.with.dots");
  });

  it("should return full name if no extension", () => {
    expect(getBaseName("noextension")).toBe("noextension");
    expect(getBaseName("README")).toBe("README");
  });

  it("should handle hidden files (starting with dot)", () => {
    expect(getBaseName(".gitignore")).toBe(".gitignore");
    expect(getBaseName(".env")).toBe(".env");
  });

  it("should handle empty string", () => {
    expect(getBaseName("")).toBe("");
  });
});

describe("getExtension", () => {
  it("should extract extension from filename", () => {
    expect(getExtension("photo.jpg")).toBe("jpg");
    expect(getExtension("document.pdf")).toBe("pdf");
    expect(getExtension("video.MP4")).toBe("MP4");
  });

  it("should return last extension for multiple dots", () => {
    expect(getExtension("document.tar.gz")).toBe("gz");
    expect(getExtension("file.name.txt")).toBe("txt");
  });

  it("should return empty string if no extension", () => {
    expect(getExtension("noextension")).toBe("");
    expect(getExtension("README")).toBe("");
  });

  it("should handle hidden files", () => {
    expect(getExtension(".gitignore")).toBe("");
    expect(getExtension(".env")).toBe("");
  });

  it("should handle empty string", () => {
    expect(getExtension("")).toBe("");
  });
});

describe("buildNamingContext", () => {
  it("should build context from file and flow context", () => {
    const file = createMockFile();
    const flowContext = {
      flowId: "flow-abc",
      jobId: "job-123",
      nodeId: "resize-1",
      nodeType: "resize",
    };

    const context = buildNamingContext(file, flowContext);

    expect(context.baseName).toBe("photo");
    expect(context.extension).toBe("jpg");
    expect(context.fileName).toBe("photo.jpg");
    expect(context.nodeType).toBe("resize");
    expect(context.nodeId).toBe("resize-1");
    expect(context.flowId).toBe("flow-abc");
    expect(context.jobId).toBe("job-123");
    expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
  });

  it("should include extra variables", () => {
    const file = createMockFile();
    const flowContext = {
      flowId: "flow-abc",
      jobId: "job-123",
      nodeId: "resize-1",
      nodeType: "resize",
    };
    const extraVars = { width: 800, height: 600, format: "webp" };

    const context = buildNamingContext(file, flowContext, extraVars);

    expect(context.width).toBe(800);
    expect(context.height).toBe(600);
    expect(context.format).toBe("webp");
  });

  it("should use fallback for missing fileName", () => {
    const file = createMockFile({ metadata: {} });
    const flowContext = {
      flowId: "flow-abc",
      jobId: "job-123",
      nodeId: "node-1",
      nodeType: "process",
    };

    const context = buildNamingContext(file, flowContext);

    expect(context.fileName).toBe("unnamed");
    expect(context.baseName).toBe("unnamed");
    expect(context.extension).toBe("");
  });

  it("should handle originalName as fallback", () => {
    const file = createMockFile({
      metadata: { originalName: "original-file.png" },
    });
    const flowContext = {
      flowId: "flow-abc",
      jobId: "job-123",
      nodeId: "node-1",
      nodeType: "process",
    };

    const context = buildNamingContext(file, flowContext);

    expect(context.fileName).toBe("original-file.png");
    expect(context.baseName).toBe("original-file");
    expect(context.extension).toBe("png");
  });
});

describe("interpolateFileName", () => {
  const sampleContext = {
    baseName: "photo",
    extension: "jpg",
    fileName: "photo.jpg",
    nodeType: "resize",
    nodeId: "resize-1",
    flowId: "flow-abc",
    jobId: "job-123",
    timestamp: "2024-01-15T10:30:00Z",
    width: 800,
    height: 600,
  };

  it("should interpolate simple variables", () => {
    const result = interpolateFileName(
      "{{baseName}}.{{extension}}",
      sampleContext,
    );
    expect(result).toBe("photo.jpg");
  });

  it("should interpolate multiple variables", () => {
    const result = interpolateFileName(
      "{{baseName}}-{{width}}x{{height}}.{{extension}}",
      sampleContext,
    );
    expect(result).toBe("photo-800x600.jpg");
  });

  it("should interpolate with static text", () => {
    const result = interpolateFileName(
      "processed-{{baseName}}-final.{{extension}}",
      sampleContext,
    );
    expect(result).toBe("processed-photo-final.jpg");
  });

  it("should handle missing variables gracefully", () => {
    const result = interpolateFileName(
      "{{baseName}}-{{unknownVar}}.{{extension}}",
      sampleContext,
    );
    // micromustache returns empty string for missing vars
    expect(result).toBe("photo-.jpg");
  });

  it("should handle pattern without variables", () => {
    const result = interpolateFileName("static-name.txt", sampleContext);
    expect(result).toBe("static-name.txt");
  });

  it("should handle empty pattern", () => {
    const result = interpolateFileName("", sampleContext);
    expect(result).toBe("");
  });
});

describe("applyFileNaming", () => {
  const file = createMockFile();
  const flowContext = {
    flowId: "flow-abc",
    jobId: "job-123",
    nodeId: "resize-1",
    nodeType: "resize",
  };

  it("should return original filename when no config", () => {
    const context = buildNamingContext(file, flowContext);
    const result = applyFileNaming(file, context);
    expect(result).toBe("photo.jpg");
  });

  it("should return original filename when no config is undefined", () => {
    const context = buildNamingContext(file, flowContext);
    const result = applyFileNaming(file, context, undefined);
    expect(result).toBe("photo.jpg");
  });

  it("should apply auto naming with suffix", () => {
    const context = buildNamingContext(file, flowContext, {
      width: 800,
      height: 600,
    });
    const config = {
      mode: "auto" as const,
      autoSuffix: (ctx: typeof context) => `${ctx.width}x${ctx.height}`,
    };

    const result = applyFileNaming(file, context, config);
    expect(result).toBe("photo-800x600.jpg");
  });

  it("should return original when auto mode has no suffix generator", () => {
    const context = buildNamingContext(file, flowContext);
    const config = { mode: "auto" as const };

    const result = applyFileNaming(file, context, config);
    expect(result).toBe("photo.jpg");
  });

  it("should apply custom naming with template pattern", () => {
    const context = buildNamingContext(file, flowContext, {
      width: 800,
      height: 600,
    });
    const config = {
      mode: "custom" as const,
      pattern: "{{baseName}}-{{nodeType}}-{{width}}w.{{extension}}",
    };

    const result = applyFileNaming(file, context, config);
    expect(result).toBe("photo-resize-800w.jpg");
  });

  it("should apply custom naming with rename function", () => {
    const context = buildNamingContext(file, flowContext);
    const config = {
      mode: "custom" as const,
      rename: (_file: UploadFile, ctx: typeof context) =>
        `custom-${ctx.baseName}.${ctx.extension}`,
    };

    const result = applyFileNaming(file, context, config);
    expect(result).toBe("custom-photo.jpg");
  });

  it("should prefer rename function over pattern in custom mode", () => {
    const context = buildNamingContext(file, flowContext);
    const config = {
      mode: "custom" as const,
      pattern: "pattern-{{baseName}}.{{extension}}",
      rename: () => "function-result.jpg",
    };

    const result = applyFileNaming(file, context, config);
    expect(result).toBe("function-result.jpg");
  });

  it("should handle file without extension in auto mode", () => {
    const noExtFile = createMockFile({
      metadata: { fileName: "noextension" },
    });
    const context = buildNamingContext(noExtFile, flowContext);
    const config = {
      mode: "auto" as const,
      autoSuffix: () => "processed",
    };

    const result = applyFileNaming(noExtFile, context, config);
    expect(result).toBe("noextension-processed");
  });

  it("should fallback to original on error in rename function", () => {
    const context = buildNamingContext(file, flowContext);
    const config = {
      mode: "custom" as const,
      rename: () => {
        throw new Error("Intentional error");
      },
    };

    const result = applyFileNaming(file, context, config);
    expect(result).toBe("photo.jpg");
  });
});

describe("validatePattern", () => {
  it("should accept valid patterns", () => {
    expect(validatePattern("{{baseName}}.{{extension}}")).toEqual({
      isValid: true,
    });
    expect(
      validatePattern("{{baseName}}-{{width}}x{{height}}.{{extension}}"),
    ).toEqual({ isValid: true });
    expect(validatePattern("static-name.txt")).toEqual({ isValid: true });
  });

  it("should reject empty pattern", () => {
    const result = validatePattern("");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("should reject whitespace-only pattern", () => {
    const result = validatePattern("   ");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("should reject unbalanced braces", () => {
    let result = validatePattern("{{baseName");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Unbalanced");

    result = validatePattern("baseName}}");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Unbalanced");

    result = validatePattern("{{a}}{{b");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Unbalanced");
  });

  it("should accept patterns with no variables", () => {
    expect(validatePattern("static-file.txt")).toEqual({ isValid: true });
  });
});

describe("AVAILABLE_TEMPLATE_VARIABLES", () => {
  it("should include all expected variables", () => {
    const varNames = AVAILABLE_TEMPLATE_VARIABLES.map((v) => v.name);

    expect(varNames).toContain("baseName");
    expect(varNames).toContain("extension");
    expect(varNames).toContain("fileName");
    expect(varNames).toContain("nodeType");
    expect(varNames).toContain("nodeId");
    expect(varNames).toContain("flowId");
    expect(varNames).toContain("jobId");
    expect(varNames).toContain("timestamp");
    expect(varNames).toContain("width");
    expect(varNames).toContain("height");
    expect(varNames).toContain("format");
  });

  it("should have description and example for each variable", () => {
    for (const variable of AVAILABLE_TEMPLATE_VARIABLES) {
      expect(variable.name).toBeTruthy();
      expect(variable.description).toBeTruthy();
      expect(variable.example).toBeTruthy();
    }
  });
});
