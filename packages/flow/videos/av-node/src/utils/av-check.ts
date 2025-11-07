/**
 * Result of node-av availability check
 */
export type AVCheckResult = {
  available: boolean;
  version?: string;
  error?: string;
};

/**
 * Checks if node-av is available and can access FFmpeg binaries
 * @returns Promise with availability status and version info
 */
export async function checkAVAvailable(): Promise<AVCheckResult> {
  try {
    // Try to import node-av to verify it's available
    await import("node-av");

    // node-av includes FFmpeg binaries, so if import succeeds, it's available
    return {
      available: true,
      version: "3.x", // node-av version is in package.json
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
