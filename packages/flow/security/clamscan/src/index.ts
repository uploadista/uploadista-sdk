// ClamAV virus scanning plugin for Uploadista Flow

// Import from core packages to ensure proper type resolution
import type {} from "@uploadista/core/types";
import type {} from "@uploadista/core/upload";

// Re-export types from core for convenience
export type { ScanMetadata, ScanResult } from "@uploadista/core/flow";

// Export plugin implementation
export { type VirusScanPluginConfig, virusScanPlugin } from "./clamscan-plugin";
