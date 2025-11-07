import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Result of FFmpeg availability check
 */
export type FFmpegCheckResult = {
  available: boolean;
  version?: string;
  error?: string;
};

/**
 * Checks if FFmpeg is installed and available in the system PATH
 * @returns Promise with availability status and version info
 */
export async function checkFFmpegAvailable(): Promise<FFmpegCheckResult> {
  try {
    const { stdout } = await execAsync("ffmpeg -version");
    // Extract version from first line (e.g., "ffmpeg version 4.4.2")
    const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
    const version = versionMatch?.[1] ?? "unknown";

    return {
      available: true,
      version,
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
