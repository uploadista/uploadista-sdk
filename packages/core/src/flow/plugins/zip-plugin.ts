import type { UploadistaError } from "@uploadista/core/errors";
import { Context, type Effect } from "effect";
import type { UploadFile } from "@/types";

/**
 * Parameters for creating a ZIP archive.
 */
export type ZipParams = {
  /** Name of the ZIP file to create */
  zipName: string;
  /** Whether to include file metadata in the ZIP archive */
  includeMetadata: boolean;
};

/**
 * Input data structure for ZIP operations.
 * Represents a single file to be included in the ZIP archive.
 */
export type ZipInput = {
  /** Unique identifier for the file */
  id: string;
  /** Binary data of the file */
  data: Uint8Array;
  /** File metadata including name, size, type, etc. */
  metadata: UploadFile["metadata"];
};

/**
 * Shape definition for the ZIP Plugin interface.
 * Defines the contract that all ZIP implementations must follow.
 */
export type ZipPluginShape = {
  /**
   * Creates a ZIP archive from multiple input files.
   *
   * @param inputs - Array of files to include in the ZIP archive
   * @param options - Configuration options for the ZIP creation
   * @returns An Effect that resolves to the ZIP file as a Uint8Array
   * @throws {UploadistaError} When ZIP creation fails
   */
  zip: (
    inputs: ZipInput[],
    options: ZipParams
  ) => Effect.Effect<Uint8Array, UploadistaError>;
  // unzip: (input: ZipInput) => Effect.Effect<Uint8Array, UploadistaError>;
};

/**
 * Context tag for the ZIP Plugin.
 *
 * This tag provides a type-safe way to access ZIP functionality
 * throughout the application using Effect's dependency injection system.
 *
 * @example
 * ```typescript
 * import { ZipPlugin } from "@uploadista/core/flow/plugins";
 *
 * // In your flow node
 * const program = Effect.gen(function* () {
 *   const zipPlugin = yield* ZipPlugin;
 *   const zipData = yield* zipPlugin.zip(files, { zipName: "archive.zip", includeMetadata: true });
 *   return zipData;
 * });
 * ```
 */
export class ZipPlugin extends Context.Tag("ZipPlugin")<
  ZipPlugin,
  ZipPluginShape
>() {}
