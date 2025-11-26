import {
  applyFileNaming,
  buildNamingContext,
  createTransformNode,
  type FileNamingConfig,
  getBaseName,
  ImagePlugin,
  type OptimizeParams,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { Effect } from "effect";

// Map image format to MIME type
const formatToMimeType: Record<OptimizeParams["format"], string> = {
  jpeg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
  avif: "image/avif",
};

// Map image format to file extension
const formatToExtension: Record<OptimizeParams["format"], string> = {
  jpeg: "jpg",
  webp: "webp",
  png: "png",
  avif: "avif",
};

/**
 * Creates an optimize node that optimizes images for web delivery.
 *
 * @param id - Unique node identifier
 * @param params - Optimize parameters (quality, format)
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `${format}`)
 *
 * @example
 * ```typescript
 * // With auto-naming: "photo.jpg" -> "photo-webp.webp"
 * const optimize = yield* createOptimizeNode("opt-1", { quality: 80, format: "webp" }, {
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createOptimizeNode(
  id: string,
  { quality, format }: OptimizeParams,
  options?: { keepOutput?: boolean; naming?: FileNamingConfig },
) {
  return Effect.gen(function* () {
    const imageService = yield* ImagePlugin;

    return yield* createTransformNode({
      id,
      name: "Optimize",
      description: "Optimizes an image for web delivery",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      // Note: naming is handled in transform since format changes extension
      nodeType: "optimize",
      namingVars: { format, quality },
      transform: (inputBytes, file) =>
        Effect.map(
          imageService.optimize(inputBytes, { quality, format }),
          (optimizedBytes) => {
            // Return bytes with updated metadata if format changes
            const newType = formatToMimeType[format];
            const newExtension = formatToExtension[format];

            // Get original fileName
            const fileName = file.metadata?.fileName;
            let newFileName: string | undefined;

            if (fileName && typeof fileName === "string") {
              // Apply naming if configured
              if (options?.naming) {
                const namingConfig: FileNamingConfig = {
                  ...options.naming,
                  autoSuffix:
                    options.naming.autoSuffix ?? ((ctx) => ctx.format ?? format),
                };
                const namingContext = buildNamingContext(
                  file,
                  {
                    flowId: file.flow?.flowId ?? "",
                    jobId: file.flow?.jobId ?? "",
                    nodeId: id,
                    nodeType: "optimize",
                  },
                  { format, quality },
                );
                // Apply naming to get base name with suffix
                const namedFile = applyFileNaming(file, namingContext, namingConfig);
                // Replace extension with new format extension
                newFileName = `${getBaseName(namedFile)}.${newExtension}`;
              } else {
                // No naming config, just update extension
                newFileName = fileName.replace(/\.[^.]+$/, `.${newExtension}`);
              }
            }

            return {
              bytes: optimizedBytes,
              type: newType,
              fileName: newFileName,
            } as
              | Uint8Array
              | { bytes: Uint8Array; type: string; fileName?: string };
          },
        ),
    });
  });
}
