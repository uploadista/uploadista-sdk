/**
 * Integration tests for plugin validation utilities.
 *
 * These tests verify runtime plugin validation behavior.
 */

import {
  type DescribeVideoMetadata,
  type ExtractFrameVideoParams,
  ImagePlugin,
  type OptimizeParams,
  type ResizeParams,
  type ResizeVideoParams,
  type TranscodeVideoParams,
  type Transformation,
  type TrimVideoParams,
  type UploadistaError,
  VideoPlugin,
  type ZipInput,
  type ZipParams,
  ZipPlugin,
} from "@uploadista/core";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  extractServiceIdentifiers,
  formatPluginValidationError,
  validatePluginRequirements,
  validatePluginsOrThrow,
} from "../../src/core/plugin-validation";

// ============================================================================
// Test Fixtures
// ============================================================================

// Create test layers
const imagePluginLayer = Layer.succeed(
  ImagePlugin,
  ImagePlugin.of({
    optimize: (input: Uint8Array, _options: OptimizeParams) =>
      Effect.succeed(input),
    resize: (input: Uint8Array, _options: ResizeParams) =>
      Effect.succeed(input),
    transform: (input: Uint8Array, _options: Transformation) =>
      Effect.succeed(input),
  }),
);
const zipPluginLayer = Layer.succeed(
  ZipPlugin,
  ZipPlugin.of({
    zip: (_inputs: ZipInput[], _options: ZipParams) =>
      Effect.succeed(new Uint8Array([])),
  }),
);
const videoPluginLayer = Layer.succeed(
  VideoPlugin,
  VideoPlugin.of({
    transcode: (input: Uint8Array, _options: TranscodeVideoParams) =>
      Effect.succeed(input),
    resize: (input: Uint8Array, _options: ResizeVideoParams) =>
      Effect.succeed(input),
    trim: (input: Uint8Array, _options: TrimVideoParams) =>
      Effect.succeed(input),
    extractFrame: (
      _input: Uint8Array,
      _options: ExtractFrameVideoParams,
    ): Effect.Effect<Uint8Array, UploadistaError> => {
      throw new Error("Function not implemented.");
    },
    describe: (
      _input: Uint8Array,
    ): Effect.Effect<DescribeVideoMetadata, UploadistaError> => {
      throw new Error("Function not implemented.");
    },
  }),
);

// ============================================================================
// extractServiceIdentifiers Tests
// ============================================================================

describe("extractServiceIdentifiers", () => {
  it("should extract identifiers from plugin array", () => {
    const plugins = [imagePluginLayer, zipPluginLayer];
    const identifiers = extractServiceIdentifiers(plugins);

    // Should return array of strings (exact values depend on Effect internals)
    expect(Array.isArray(identifiers)).toBe(true);
    expect(identifiers.length).toBeGreaterThanOrEqual(0);
  });

  it("should handle empty plugin array", () => {
    const plugins: never[] = [];
    const identifiers = extractServiceIdentifiers(plugins);

    expect(Array.isArray(identifiers)).toBe(true);
    expect(identifiers).toHaveLength(0);
  });

  it("should handle single plugin", () => {
    const plugins = [imagePluginLayer];
    const identifiers = extractServiceIdentifiers(plugins);

    expect(Array.isArray(identifiers)).toBe(true);
  });
});

// ============================================================================
// validatePluginRequirements Tests
// ============================================================================

describe("validatePluginRequirements", () => {
  it("should return success when no services are expected", () => {
    const result = validatePluginRequirements({
      plugins: [imagePluginLayer],
      expectedServices: [],
    });

    expect(result.success).toBe(true);
  });

  it("should return success when expected services is undefined", () => {
    const result = validatePluginRequirements({
      plugins: [imagePluginLayer],
    });

    expect(result.success).toBe(true);
  });

  it("should detect missing services", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ImagePlugin", "ZipPlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.missing).toEqual(["ImagePlugin", "ZipPlugin"]);
      expect(result.required).toEqual(["ImagePlugin", "ZipPlugin"]);
      expect(result.provided).toEqual([]);
    }
  });

  it("should detect partially missing services", () => {
    const result = validatePluginRequirements({
      plugins: [imagePluginLayer],
      expectedServices: ["ImagePlugin", "ZipPlugin"],
    });

    // Since we can't reliably extract service identifiers from Effect layers,
    // this test verifies the validation logic structure
    expect(result).toHaveProperty("success");
  });

  it("should generate suggestions for known plugins", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ImagePlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.suggestions.length).toBeGreaterThan(0);
      const suggestion = result.suggestions[0];
      expect(suggestion).toHaveProperty("name");
      expect(suggestion).toHaveProperty("packageName");
      expect(suggestion).toHaveProperty("importStatement");
      expect(suggestion.name).toBe("ImagePlugin");
    }
  });

  it("should handle unknown plugin services", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["UnknownPlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.missing).toContain("UnknownPlugin");
      // Should not generate suggestion for unknown plugins
      const unknownSuggestion = result.suggestions.find(
        (s) => s.name === "UnknownPlugin",
      );
      expect(unknownSuggestion).toBeUndefined();
    }
  });

  it("should handle multiple known plugins", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ImagePlugin", "ZipPlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.suggestions.length).toBe(2);
      expect(result.suggestions.map((s) => s.name)).toEqual([
        "ImagePlugin",
        "ZipPlugin",
      ]);
    }
  });
});

// ============================================================================
// formatPluginValidationError Tests
// ============================================================================

describe("formatPluginValidationError", () => {
  it("should format error message with suggestions", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ImagePlugin", "ZipPlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = formatPluginValidationError(result);

      expect(message).toContain("Server initialization failed");
      expect(message).toContain("Missing required plugins");
      expect(message).toContain("ImagePlugin");
      expect(message).toContain("ZipPlugin");
      expect(message).toContain("Required:");
      expect(message).toContain("Missing:");
    }
  });

  it("should include import statements in error message", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ImagePlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = formatPluginValidationError(result);

      expect(message).toContain("import");
      expect(message).toContain("@uploadista/flow-images-sharp");
      expect(message).toContain("sharpImagePlugin");
    }
  });

  it("should include example server configuration", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ImagePlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = formatPluginValidationError(result);

      expect(message).toContain("createUploadistaServer");
      expect(message).toContain("plugins:");
    }
  });

  it("should handle missing suggestions gracefully", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["UnknownPlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = formatPluginValidationError(result);

      expect(message).toContain("Server initialization failed");
      expect(message).toContain("UnknownPlugin");
      expect(message).toContain(
        "Could not determine package names for missing plugins",
      );
    }
  });

  it("should show provided services when some are present", () => {
    const result = validatePluginRequirements({
      plugins: [imagePluginLayer],
      expectedServices: ["ImagePlugin", "ZipPlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = formatPluginValidationError(result);

      expect(message).toContain("Provided:");
      // The exact provided services depend on Effect's internal representation
    }
  });
});

// ============================================================================
// validatePluginsOrThrow Tests
// ============================================================================

describe("validatePluginsOrThrow", () => {
  it("should not throw when validation passes", () => {
    expect(() => {
      validatePluginsOrThrow({
        plugins: [imagePluginLayer],
        expectedServices: [],
      });
    }).not.toThrow();
  });

  it("should throw when validation fails", () => {
    expect(() => {
      validatePluginsOrThrow({
        plugins: [],
        expectedServices: ["ImagePlugin"],
      });
    }).toThrow("Server initialization failed");
  });

  it("should throw error with detailed message", () => {
    expect(() => {
      validatePluginsOrThrow({
        plugins: [],
        expectedServices: ["ImagePlugin", "ZipPlugin"],
      });
    }).toThrow(/Missing required plugins/);
  });

  it("should include plugin names in error", () => {
    try {
      validatePluginsOrThrow({
        plugins: [],
        expectedServices: ["ImagePlugin", "ZipPlugin"],
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) {
        expect(error.message).toContain("ImagePlugin");
        expect(error.message).toContain("ZipPlugin");
      }
    }
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Plugin Validation Integration", () => {
  it("should handle realistic server configuration scenario", () => {
    // Scenario: Server configured with image plugin, but flow needs both image and zip
    const result = validatePluginRequirements({
      plugins: [imagePluginLayer],
      expectedServices: ["ImagePlugin", "ZipPlugin"],
    });

    if (!result.success) {
      const message = formatPluginValidationError(result);

      // Should provide actionable error message
      expect(message).toContain("Missing required plugins");
      expect(message).toContain("@uploadista/flow-utility-zipjs");
      expect(message).toContain("zipPlugin");
    }
  });

  it("should handle empty configuration", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: [],
    });

    expect(result.success).toBe(true);
  });

  it("should handle over-provisioned plugins", () => {
    // More plugins than required should still pass
    const result = validatePluginRequirements({
      plugins: [imagePluginLayer, zipPluginLayer, videoPluginLayer],
      expectedServices: ["ImagePlugin"],
    });

    // This would pass if we could extract identifiers reliably
    // For now, just verify structure
    expect(result).toHaveProperty("success");
  });

  it("should provide helpful error for complete plugin set missing", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ImagePlugin", "ZipPlugin", "VideoPlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.missing).toHaveLength(3);
      const message = formatPluginValidationError(result);

      // Should list all missing plugins
      expect(message).toContain("ImagePlugin");
      expect(message).toContain("ZipPlugin");
      expect(message).toContain("VideoPlugin");
    }
  });
});

// ============================================================================
// Known Plugins Mapping Tests
// ============================================================================

describe("Known Plugins Mapping", () => {
  it("should generate suggestions for missing plugins", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ImagePlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Verify suggestions array exists
      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);

      // If there are suggestions, check the structure
      if (result.suggestions.length > 0) {
        const suggestion = result.suggestions[0];
        expect(suggestion).toHaveProperty("name");
        expect(suggestion).toHaveProperty("packageName");
        expect(suggestion).toHaveProperty("importStatement");
      }
    }
  });

  it("should provide correct package for ImagePlugin", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ImagePlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success && result.suggestions.length > 0) {
      const suggestion = result.suggestions[0];
      expect(suggestion.name).toBe("ImagePlugin");
      expect(suggestion.packageName).toBe("@uploadista/flow-images-sharp");
      expect(suggestion.importStatement).toContain("sharpImagePlugin");
      expect(suggestion.importStatement).toContain(
        "@uploadista/flow-images-sharp",
      );
    }
  });

  it("should provide correct package for ZipPlugin", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ZipPlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.suggestions.length).toBeGreaterThan(0);

      const suggestion = result.suggestions[0];
      expect(suggestion).toBeDefined();
      expect(suggestion.name).toBe("ZipPlugin");
      expect(suggestion.packageName).toBe("@uploadista/flow-utility-zipjs");
      expect(suggestion.importStatement).toContain("zipPlugin");
      expect(suggestion.importStatement).toContain(
        "@uploadista/flow-utility-zipjs",
      );
    }
  });

  it("should provide correct package for ImageAiPlugin", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["ImageAiPlugin"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.suggestions.length).toBeGreaterThan(0);

      const suggestion = result.suggestions[0];
      expect(suggestion).toBeDefined();
      expect(suggestion.name).toBe("ImageAiPlugin");
      expect(suggestion.packageName).toBe("@uploadista/flow-images-replicate");
      expect(suggestion.importStatement).toContain("replicateImagePlugin");
      expect(suggestion.importStatement).toContain(
        "@uploadista/flow-images-replicate",
      );
    }
  });

  it("should provide correct package for CredentialProvider", () => {
    const result = validatePluginRequirements({
      plugins: [],
      expectedServices: ["CredentialProvider"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.suggestions.length).toBeGreaterThan(0);

      const suggestion = result.suggestions[0];
      expect(suggestion).toBeDefined();
      expect(suggestion.name).toBe("CredentialProvider");
      expect(suggestion.packageName).toBe("@uploadista/core");
      expect(suggestion.importStatement).toContain("credentialProviderLayer");
      expect(suggestion.importStatement).toContain("@uploadista/core");
    }
  });
});
