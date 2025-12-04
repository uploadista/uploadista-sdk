/**
 * File naming utilities for the flow engine.
 *
 * This module provides functions for generating dynamic file names based on
 * templates, auto-suffixes, or custom functions. It supports mustache-style
 * template interpolation using micromustache.
 *
 * @module flow/utils/file-naming
 */

import { render } from "micromustache";
import type { UploadFile } from "../../types/upload-file";
import type {
  FileNamingConfig,
  NamingContext,
} from "../types/flow-types";

/**
 * Extracts the base name (without extension) from a filename.
 *
 * @param fileName - The full filename
 * @returns The filename without extension
 *
 * @example
 * ```typescript
 * getBaseName("photo.jpg") // "photo"
 * getBaseName("document.tar.gz") // "document.tar"
 * getBaseName("noextension") // "noextension"
 * ```
 */
export function getBaseName(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return fileName;
  }
  return fileName.substring(0, lastDotIndex);
}

/**
 * Extracts the extension (without dot) from a filename.
 *
 * @param fileName - The full filename
 * @returns The extension without leading dot, or empty string if none
 *
 * @example
 * ```typescript
 * getExtension("photo.jpg") // "jpg"
 * getExtension("document.tar.gz") // "gz"
 * getExtension("noextension") // ""
 * ```
 */
export function getExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return "";
  }
  return fileName.substring(lastDotIndex + 1);
}

/**
 * Builds a naming context from file and flow execution information.
 *
 * @param file - The UploadFile being processed
 * @param flowContext - Flow execution context (flowId, jobId, nodeId, nodeType)
 * @param extraVars - Additional variables to include (width, height, format, etc.)
 * @returns Complete naming context for template interpolation
 *
 * @example
 * ```typescript
 * const context = buildNamingContext(
 *   uploadFile,
 *   { flowId: "flow-1", jobId: "job-1", nodeId: "resize-1", nodeType: "resize" },
 *   { width: 800, height: 600 }
 * );
 * // context.baseName = "photo"
 * // context.extension = "jpg"
 * // context.width = 800
 * // context.height = 600
 * ```
 */
export function buildNamingContext(
  file: UploadFile,
  flowContext: {
    flowId: string;
    jobId: string;
    nodeId: string;
    nodeType: string;
  },
  extraVars?: Record<string, string | number | undefined>,
): NamingContext {
  // Extract fileName from metadata
  const metadata = file.metadata ?? {};
  const fileName =
    (metadata.fileName as string) ??
    (metadata.originalName as string) ??
    (metadata.name as string) ??
    "unnamed";

  const baseName = getBaseName(fileName);
  const extension = getExtension(fileName);

  return {
    baseName,
    extension,
    fileName,
    nodeType: flowContext.nodeType,
    nodeId: flowContext.nodeId,
    flowId: flowContext.flowId,
    jobId: flowContext.jobId,
    timestamp: new Date().toISOString(),
    ...extraVars,
  };
}

/**
 * Interpolates a mustache-style template with the given context.
 *
 * Uses micromustache for fast, secure template rendering.
 * Unknown variables are preserved as-is (e.g., {{unknown}} stays {{unknown}}).
 *
 * @param pattern - Mustache-style template string
 * @param context - Variables to interpolate
 * @returns Interpolated string
 *
 * @example
 * ```typescript
 * interpolateFileName(
 *   "{{baseName}}-{{width}}x{{height}}.{{extension}}",
 *   { baseName: "photo", width: 800, height: 600, extension: "jpg" }
 * );
 * // Returns: "photo-800x600.jpg"
 * ```
 */
export function interpolateFileName(
  pattern: string,
  context: NamingContext,
): string {
  try {
    // Convert context to string values for micromustache
    const stringContext: Record<string, string> = {};
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) {
        stringContext[key] = String(value);
      }
    }
    return render(pattern, stringContext);
  } catch {
    // On error, return the pattern as-is (fallback behavior)
    return pattern;
  }
}

/**
 * Applies file naming configuration to generate a new filename.
 *
 * Handles three modes:
 * - No config: Returns original filename (backward compatible)
 * - Auto mode: Appends auto-generated suffix based on node type
 * - Custom mode: Uses template pattern or rename function
 *
 * On any error, falls back to the original filename to prevent flow failures.
 *
 * @param file - The UploadFile being processed
 * @param context - Naming context with all available variables
 * @param config - Optional naming configuration
 * @returns The new filename (or original on error/no config)
 *
 * @example
 * ```typescript
 * // Auto mode
 * applyFileNaming(file, context, {
 *   mode: 'auto',
 *   autoSuffix: (ctx) => `${ctx.width}x${ctx.height}`
 * });
 * // Returns: "photo-800x600.jpg"
 *
 * // Custom mode with template
 * applyFileNaming(file, context, {
 *   mode: 'custom',
 *   pattern: '{{baseName}}-processed.{{extension}}'
 * });
 * // Returns: "photo-processed.jpg"
 *
 * // Custom mode with function
 * applyFileNaming(file, context, {
 *   mode: 'custom',
 *   rename: (file, ctx) => `${ctx.flowId}-${ctx.fileName}`
 * });
 * // Returns: "flow-1-photo.jpg"
 * ```
 */
export function applyFileNaming(
  file: UploadFile,
  context: NamingContext,
  config?: FileNamingConfig,
): string {
  const originalFileName = context.fileName;

  // No config = preserve original (backward compatible)
  if (!config) {
    return originalFileName;
  }

  try {
    if (config.mode === "auto") {
      // Auto mode: append auto-generated suffix
      if (config.autoSuffix) {
        const suffix = config.autoSuffix(context);
        if (suffix) {
          const { baseName, extension } = context;
          return extension
            ? `${baseName}-${suffix}.${extension}`
            : `${baseName}-${suffix}`;
        }
      }
      // No autoSuffix defined, preserve original
      return originalFileName;
    }

    if (config.mode === "custom") {
      // Custom mode: use function or template
      if (config.rename) {
        const result = config.rename(file, context);
        return result || originalFileName;
      }
      if (config.pattern) {
        const result = interpolateFileName(config.pattern, context);
        return result || originalFileName;
      }
    }

    // Unknown mode, preserve original
    return originalFileName;
  } catch {
    // On any error, fall back to original filename
    return originalFileName;
  }
}

/**
 * Validates a template pattern for common issues.
 *
 * Checks for:
 * - Balanced braces
 * - Non-empty pattern
 * - Valid variable names
 *
 * @param pattern - Template pattern to validate
 * @returns Object with isValid flag and optional error message
 *
 * @example
 * ```typescript
 * validatePattern("{{baseName}}.{{extension}}");
 * // { isValid: true }
 *
 * validatePattern("{{baseName");
 * // { isValid: false, error: "Unbalanced braces: missing closing }}" }
 * ```
 */
export function validatePattern(pattern: string): {
  isValid: boolean;
  error?: string;
} {
  if (!pattern || pattern.trim() === "") {
    return { isValid: false, error: "Pattern cannot be empty" };
  }

  // Check for balanced braces
  const openCount = (pattern.match(/\{\{/g) || []).length;
  const closeCount = (pattern.match(/\}\}/g) || []).length;

  if (openCount !== closeCount) {
    return {
      isValid: false,
      error: `Unbalanced braces: ${openCount} opening, ${closeCount} closing`,
    };
  }

  // Check for valid variable syntax
  const invalidVars = pattern.match(/\{\{[^}]*[^a-zA-Z0-9_}][^}]*\}\}/g);
  if (invalidVars) {
    return {
      isValid: false,
      error: `Invalid variable syntax: ${invalidVars[0]}`,
    };
  }

  return { isValid: true };
}

/**
 * List of available template variables for documentation and UI.
 */
export const AVAILABLE_TEMPLATE_VARIABLES = [
  { name: "baseName", description: "Filename without extension", example: "photo" },
  { name: "extension", description: "File extension without dot", example: "jpg" },
  { name: "fileName", description: "Full original filename", example: "photo.jpg" },
  { name: "nodeType", description: "Type of processing node", example: "resize" },
  { name: "nodeId", description: "Specific node instance ID", example: "resize-1" },
  { name: "flowId", description: "Flow identifier", example: "flow-abc" },
  { name: "jobId", description: "Execution job ID", example: "job-123" },
  { name: "timestamp", description: "ISO 8601 processing time", example: "2024-01-15T10:30:00Z" },
  { name: "width", description: "Output width (image/video)", example: "800" },
  { name: "height", description: "Output height (image/video)", example: "600" },
  { name: "format", description: "Output format", example: "webp" },
  { name: "quality", description: "Quality setting", example: "80" },
  { name: "pageNumber", description: "Page number (documents)", example: "1" },
] as const;
