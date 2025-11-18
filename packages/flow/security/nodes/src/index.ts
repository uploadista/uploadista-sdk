// Security processing nodes

// Import from core packages to ensure proper type resolution in generated declarations
// These imports force tsdown to create namespace aliases instead of inlining types
import type {} from "@uploadista/core/types";
import type {} from "@uploadista/core/upload";

// Re-export types from core for convenience
export type { ScanMetadata, ScanResult } from "@uploadista/core/flow";
export {
  createScanVirusNode,
  ScanAction,
  type ScanAction as ScanActionType,
  ScanVirusParams,
  type ScanVirusParams as ScanVirusParamsType,
} from "./scan-virus-node";
