import { Effect, Layer } from "effect";
import { VirusScanPlugin } from "../flow";

/**
 * EICAR test file signature (standard antivirus test file)
 * This is a safe, non-malicious string used to test antivirus software
 */
const EICAR_SIGNATURE =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/**
 * Mock VirusScanPlugin implementation for testing.
 *
 * Provides a simple mock implementation that:
 * - Detects the EICAR test signature as infected
 * - Treats all other files as clean
 * - Returns mock version information
 *
 * @example
 * ```typescript
 * import { TestVirusScanPlugin } from "@uploadista/core/testing";
 *
 * const program = Effect.gen(function* () {
 *   const plugin = yield* VirusScanPlugin;
 *   const result = yield* plugin.scan(fileBytes);
 *   console.log(result.isClean ? "Clean" : "Infected");
 * }).pipe(Effect.provide(TestVirusScanPlugin));
 * ```
 */
export const TestVirusScanPlugin = Layer.succeed(
  VirusScanPlugin,
  VirusScanPlugin.of({
    scan: (input: Uint8Array) =>
      Effect.sync(() => {
        // Convert bytes to string to check for EICAR signature
        const textDecoder = new TextDecoder();
        const content = textDecoder.decode(input);

        // Check if file contains EICAR test signature
        if (content.includes(EICAR_SIGNATURE)) {
          return {
            isClean: false,
            detectedViruses: ["EICAR-Test-File"],
          };
        }

        // All other files are considered clean
        return {
          isClean: true,
          detectedViruses: [],
        };
      }),
    getVersion: () =>
      Effect.sync(() => {
        return "TestVirusScanPlugin 1.0.0";
      }),
  }),
);
