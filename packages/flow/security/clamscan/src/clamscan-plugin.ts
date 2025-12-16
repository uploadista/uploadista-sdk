import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { UploadistaError } from "@uploadista/core/errors";
import type { ScanResult, VirusScanPluginShape } from "@uploadista/core/flow";
import { VirusScanPlugin } from "@uploadista/core/flow";
import { withOperationSpan } from "@uploadista/observability";
import NodeClam from "clamscan";
import { Effect, Layer } from "effect";

/**
 * Configuration options for the ClamAV Virus Scan plugin
 */
export interface VirusScanPluginConfig {
  /**
   * Preference for scanning method
   * - "clamdscan": Use clamd daemon (faster, recommended)
   * - "clamscan": Use command-line binary
   */
  preference?: "clamdscan" | "clamscan";

  /**
   * Path to clamd socket (for daemon mode)
   * Default: /var/run/clamd.scan/clamd.sock
   */
  clamdscan_socket?: string;

  /**
   * TCP host for clamd (alternative to socket)
   */
  clamdscan_host?: string;

  /**
   * TCP port for clamd
   * Default: 3310
   */
  clamdscan_port?: number;

  /**
   * Whether to remove infected files automatically
   * Default: false (not recommended in flow context)
   */
  remove_infected?: boolean;

  /**
   * Debug mode for clamscan library
   * Default: false
   */
  debug_mode?: boolean;
}

/**
 * ClamAV implementation of the VirusScanPlugin
 *
 * This plugin uses the `clamscan` npm package to scan files for viruses
 * using ClamAV antivirus engine. It supports both clamd daemon mode (fast)
 * and binary mode (slower but more portable).
 *
 * @example
 * ```typescript
 * import { ClamScanPluginLayer } from "@uploadista/flow-security-clamscan";
 *
 * const program = Effect.gen(function* () {
 *   const virusScan = yield* VirusScanPlugin;
 *   const result = yield* virusScan.scan(fileBytes);
 *   console.log(result.isClean ? "Clean" : "Infected");
 * }).pipe(Effect.provide(ClamScanPluginLayer));
 * ```
 */
class ClamScanPluginImpl implements VirusScanPluginShape {
  private clamscan: NodeClam | null = null;

  constructor(private config: VirusScanPluginConfig = {}) {}

  /**
   * Initialize the ClamAV scanner
   * This is called lazily on first use
   */
  private initScanner(): Effect.Effect<NodeClam, UploadistaError> {
    return Effect.gen(
      function* (this: ClamScanPluginImpl) {
        if (this.clamscan) {
          return this.clamscan;
        }

        const scanner = yield* Effect.tryPromise({
          try: async () => {
            // Initialize clamscan with configuration
            return await new NodeClam().init({
              preference: this.config.preference ?? "clamdscan",
              remove_infected: this.config.remove_infected ?? false,
              debug_mode: this.config.debug_mode ?? false,
              clamdscan: {
                socket: this.config.clamdscan_socket,
                host: this.config.clamdscan_host,
                port: this.config.clamdscan_port ?? 3310,
                timeout: 60000,
                local_fallback: true, // Fall back to binary if daemon unavailable
              },
              clamscan: {
                path: "/usr/bin/clamscan", // Standard path
                scan_archives: true,
                active: true,
              },
            });
          },
          catch: (error) =>
            UploadistaError.fromCode("CLAMAV_NOT_INSTALLED", {
              body: `ClamAV initialization failed: ${error instanceof Error ? error.message : String(error)}`,
              details: { error },
            }),
        });

        this.clamscan = scanner;
        return scanner;
      }.bind(this),
    ).pipe(
      withOperationSpan("virus-scan", "init", {
        "scan.preference": this.config.preference ?? "clamdscan",
      }),
    );
  }

  /**
   * Scans a file for viruses using ClamAV
   *
   * @param input - File contents as Uint8Array
   * @returns Effect with scan results
   */
  scan(input: Uint8Array): Effect.Effect<ScanResult, UploadistaError> {
    return Effect.gen(
      function* (this: ClamScanPluginImpl) {
        // Initialize scanner (lazy initialization)
        const scanner = yield* this.initScanner();

        // Create temporary file path for scanning
        const tmpDir = os.tmpdir();
        const fileName = `uploadista-scan-${randomUUID()}`;
        const tempFilePath = path.join(tmpDir, fileName);

        // Write file data to temp file
        yield* Effect.tryPromise({
          try: () => fs.writeFile(tempFilePath, input),
          catch: (error) =>
            UploadistaError.fromCode("VIRUS_SCAN_FAILED", {
              body: "Failed to create temporary file for scanning",
              details: { error },
            }),
        });

        // Scan the file and ensure cleanup
        const result = yield* Effect.tryPromise({
          try: () => scanner.isInfected(tempFilePath),
          catch: (error) =>
            UploadistaError.fromCode("VIRUS_SCAN_FAILED", {
              body: `Virus scan failed: ${error instanceof Error ? error.message : String(error)}`,
              details: { error },
            }),
        }).pipe(
          Effect.map((scanResult) => ({
            isClean: !scanResult.isInfected,
            detectedViruses: scanResult.viruses || [],
          })),
          Effect.ensuring(
            // Clean up temporary file (ignore errors)
            Effect.tryPromise({
              try: () => fs.unlink(tempFilePath),
              catch: () => undefined,
            }).pipe(Effect.ignore),
          ),
        );

        return result;
      }.bind(this),
    ).pipe(
      withOperationSpan("virus-scan", "scan", {
        "scan.file_size": input.byteLength,
      }),
    );
  }

  /**
   * Gets the ClamAV engine version
   *
   * @returns Effect with version string
   */
  getVersion(): Effect.Effect<string, UploadistaError> {
    return Effect.gen(
      function* (this: ClamScanPluginImpl) {
        // Initialize scanner (lazy initialization)
        const scanner = yield* this.initScanner();

        // Get version from ClamAV
        const versionResult = yield* Effect.tryPromise({
          try: () => scanner.getVersion(),
          catch: (error) =>
            UploadistaError.fromCode("VIRUS_SCAN_FAILED", {
              body: "Failed to get ClamAV version",
              details: { error },
            }),
        });

        return versionResult.version || "Unknown";
      }.bind(this),
    ).pipe(withOperationSpan("virus-scan", "get-version", {}));
  }
}

/**
 * Creates a Virus Scan Plugin layer using ClamAV
 *
 * @param config - Optional ClamAV configuration
 * @returns Layer providing VirusScanPlugin
 *
 * @example
 * ```typescript
 * // Use with default configuration
 * const layer = ClamScanPluginLayer();
 *
 * // Use with custom configuration
 * const customLayer = ClamScanPluginLayer({
 *   preference: "clamdscan",
 *   clamdscan_socket: "/var/run/clamav/clamd.ctl"
 * });
 * ```
 */
export function virusScanPlugin(
  config: VirusScanPluginConfig = {},
): Layer.Layer<VirusScanPlugin, never, never> {
  return Layer.succeed(VirusScanPlugin, new ClamScanPluginImpl(config));
}
