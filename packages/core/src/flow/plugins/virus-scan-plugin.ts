import { Context, type Effect, type Layer } from "effect";
import type { UploadistaError } from "../../errors";

/**
 * Result of a virus scan operation.
 */
export type ScanResult = {
  /**
   * Whether the file is clean (no viruses detected)
   */
  isClean: boolean;

  /**
   * Array of detected virus/malware names (empty if clean)
   */
  detectedViruses: string[];
};

/**
 * Comprehensive metadata about a virus scan operation.
 */
export type ScanMetadata = {
  /**
   * Whether the file was scanned
   */
  scanned: boolean;

  /**
   * Whether the file is clean (no viruses detected)
   */
  isClean: boolean;

  /**
   * Array of detected virus/malware names (empty if clean)
   */
  detectedViruses: string[];

  /**
   * ISO 8601 timestamp of when the scan was performed
   */
  scanDate: string;

  /**
   * Version of the antivirus engine used
   */
  engineVersion: string;

  /**
   * ISO 8601 timestamp of when virus definitions were last updated
   */
  definitionsDate: string;
};

/**
 * Shape definition for the Virus Scan Plugin interface.
 * Defines the contract that all virus scanning implementations must follow.
 */
export type VirusScanPluginShape = {
  /**
   * Scans a file for viruses and malware.
   *
   * @param input - The input file as a Uint8Array
   * @returns An Effect that resolves to ScanResult with detection information
   * @throws {UploadistaError} When virus scanning fails or ClamAV is unavailable
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const virusScanPlugin = yield* VirusScanPlugin;
   *   const result = yield* virusScanPlugin.scan(fileData);
   *   if (!result.isClean) {
   *     console.log('Viruses detected:', result.detectedViruses);
   *   }
   * });
   * ```
   */
  scan: (input: Uint8Array) => Effect.Effect<ScanResult, UploadistaError>;

  /**
   * Retrieves the version of the antivirus engine.
   *
   * @returns An Effect that resolves to the engine version string
   * @throws {UploadistaError} When version retrieval fails
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const virusScanPlugin = yield* VirusScanPlugin;
   *   const version = yield* virusScanPlugin.getVersion();
   *   console.log('ClamAV version:', version);
   * });
   * ```
   */
  getVersion: () => Effect.Effect<string, UploadistaError>;
};

/**
 * Context tag for the Virus Scan Plugin.
 *
 * This tag provides a type-safe way to access virus scanning functionality
 * throughout the application using Effect's dependency injection system.
 *
 * @example
 * ```typescript
 * import { VirusScanPlugin } from "@uploadista/core/flow/plugins";
 *
 * // In your flow node
 * const program = Effect.gen(function* () {
 *   const virusScanPlugin = yield* VirusScanPlugin;
 *   const result = yield* virusScanPlugin.scan(fileData);
 *
 *   if (!result.isClean) {
 *     // Handle infected file
 *     return Effect.fail(new UploadistaError({
 *       code: "VIRUS_DETECTED",
 *       message: `Viruses detected: ${result.detectedViruses.join(', ')}`
 *     }));
 *   }
 *
 *   return fileData;
 * });
 * ```
 */
export class VirusScanPlugin extends Context.Tag("VirusScanPlugin")<
  VirusScanPlugin,
  VirusScanPluginShape
>() {}

export type VirusScanPluginLayer = Layer.Layer<VirusScanPlugin, never, never>;
