import { httpFailure } from "@uploadista/core/errors";
import {
  createTransformNode,
  type ScanMetadata,
  VirusScanPlugin,
} from "@uploadista/core/flow";
import { Effect } from "effect";
import { z } from "zod";

/**
 * Scan action to take when a virus is detected
 */
export const ScanAction = z.enum(["fail", "pass"]);
export type ScanAction = z.infer<typeof ScanAction>;

/**
 * Parameters for the Scan Virus node
 */
export const ScanVirusParams = z.object({
  /**
   * Action to take when a virus is detected:
   * - "fail": Mark flow task as FAILED and stop processing
   * - "pass": Continue processing but add virus metadata to file
   */
  action: ScanAction.default("fail"),

  /**
   * Maximum time to wait for scan completion (in milliseconds)
   * Default: 60000ms (60 seconds)
   * Max: 300000ms (5 minutes)
   */
  timeout: z.number().min(1000).max(300000).optional().default(60000),
});

export type ScanVirusParams = z.infer<typeof ScanVirusParams>;

/**
 * Creates a Scan Virus node for malware detection
 *
 * Scans files for viruses and malware using the configured VirusScanPlugin
 * (typically ClamAV). Supports configurable actions on detection:
 * - "fail": Stop flow execution when virus detected
 * - "pass": Continue flow with detection metadata
 *
 * All scan results are stored in file.metadata.virusScan for downstream nodes.
 *
 * @param id - Unique node identifier
 * @param params - Configuration parameters for scan behavior
 * @returns Effect that resolves to the configured node
 *
 * @example
 * ```typescript
 * // Fail on virus detection (default)
 * const failNode = yield* createScanVirusNode("scan-1", {
 *   action: "fail"
 * });
 *
 * // Pass through with metadata
 * const passNode = yield* createScanVirusNode("scan-2", {
 *   action: "pass",
 *   timeout: 120000 // 2 minutes
 * });
 * ```
 */
export function createScanVirusNode(
  id: string,
  params: ScanVirusParams = { action: "fail", timeout: 60000 },
) {
  return Effect.gen(function* () {
    const virusScanService = yield* VirusScanPlugin;

    // Validate params
    const validatedParams = ScanVirusParams.parse(params);

    return yield* createTransformNode({
      id,
      name: "Scan Virus",
      description: "Scans files for viruses and malware using ClamAV",
      transform: (inputBytes, file) =>
        Effect.gen(function* () {
          // Perform virus scan
          const scanResult = yield* virusScanService.scan(inputBytes);

          // Get engine version for metadata
          const engineVersion = yield* virusScanService.getVersion();

          // Build comprehensive scan metadata
          const scanMetadata: ScanMetadata = {
            scanned: true,
            isClean: scanResult.isClean,
            detectedViruses: scanResult.detectedViruses,
            scanDate: new Date().toISOString(),
            engineVersion,
            definitionsDate: new Date().toISOString(), // TODO: Get actual definitions date from plugin
          };

          // Check if virus was detected
          if (!scanResult.isClean) {
            // Build error message with detected viruses
            const virusList = scanResult.detectedViruses.join(", ");
            const message = `Virus detected: ${virusList}`;

            // Handle based on configured action
            if (validatedParams.action === "fail") {
              // Fail the flow task
              return yield* httpFailure("VIRUS_DETECTED", {
                body: message,
                details: { scanMetadata },
              });
            }
            // action === "pass": Continue with metadata (handled below)
          }

          // Return file with scan metadata (clean or pass action)
          return {
            bytes: inputBytes, // Pass through original bytes unchanged
            metadata: {
              ...file.metadata,
              virusScan: scanMetadata,
            },
          };
        }),
    });
  });
}
