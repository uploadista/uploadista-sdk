/**
 * Permission Types and Constants
 *
 * Defines the permission model for fine-grained access control in the uploadista engine.
 * Permissions follow a hierarchical format: `resource:action` with support for wildcards.
 */

// ============================================================================
// Engine Permissions - Admin operations
// ============================================================================

/**
 * Engine permissions for administrative operations.
 * These control access to health, readiness, metrics, and DLQ endpoints.
 */
export const ENGINE_PERMISSIONS = {
  /** Full admin access to all engine operations */
  ALL: "engine:*",
  /** Access health endpoint */
  HEALTH: "engine:health",
  /** Access readiness endpoint */
  READINESS: "engine:readiness",
  /** Access metrics endpoint */
  METRICS: "engine:metrics",
  /** Full DLQ access (implies read and write) */
  DLQ: "engine:dlq",
  /** Read DLQ entries */
  DLQ_READ: "engine:dlq:read",
  /** Retry/delete DLQ entries */
  DLQ_WRITE: "engine:dlq:write",
} as const;

// ============================================================================
// Flow Permissions - Flow execution operations
// ============================================================================

/**
 * Flow permissions for flow execution operations.
 */
export const FLOW_PERMISSIONS = {
  /** Full access to all flow operations */
  ALL: "flow:*",
  /** Execute flows */
  EXECUTE: "flow:execute",
  /** Cancel running flows */
  CANCEL: "flow:cancel",
  /** Check flow status */
  STATUS: "flow:status",
} as const;

// ============================================================================
// Upload Permissions - File upload operations
// ============================================================================

/**
 * Upload permissions for file upload operations.
 */
export const UPLOAD_PERMISSIONS = {
  /** Full access to all upload operations */
  ALL: "upload:*",
  /** Create uploads */
  CREATE: "upload:create",
  /** Read upload status */
  READ: "upload:read",
  /** Cancel uploads */
  CANCEL: "upload:cancel",
} as const;

// ============================================================================
// Combined Permissions Object
// ============================================================================

/**
 * All available permissions organized by category.
 *
 * @example
 * ```typescript
 * import { PERMISSIONS } from "@uploadista/server";
 *
 * const adminPermissions = [PERMISSIONS.ENGINE.ALL];
 * const userPermissions = [PERMISSIONS.FLOW.ALL, PERMISSIONS.UPLOAD.ALL];
 * ```
 */
export const PERMISSIONS = {
  ENGINE: ENGINE_PERMISSIONS,
  FLOW: FLOW_PERMISSIONS,
  UPLOAD: UPLOAD_PERMISSIONS,
} as const;

// ============================================================================
// Permission Type Definitions
// ============================================================================

/** All engine permission strings */
export type EnginePermission =
  (typeof ENGINE_PERMISSIONS)[keyof typeof ENGINE_PERMISSIONS];

/** All flow permission strings */
export type FlowPermission =
  (typeof FLOW_PERMISSIONS)[keyof typeof FLOW_PERMISSIONS];

/** All upload permission strings */
export type UploadPermission =
  (typeof UPLOAD_PERMISSIONS)[keyof typeof UPLOAD_PERMISSIONS];

/**
 * Union type of all valid permission strings.
 * Includes standard permissions and allows custom permissions via string.
 */
export type Permission =
  | EnginePermission
  | FlowPermission
  | UploadPermission
  | (string & {}); // Allow custom permissions while maintaining autocomplete

/**
 * Predefined permission sets for common use cases.
 */
export const PERMISSION_SETS = {
  /** Full admin access - all engine, flow, and upload permissions */
  ADMIN: [ENGINE_PERMISSIONS.ALL] as const,

  /** Organization owner - all flow and upload permissions */
  ORGANIZATION_OWNER: [FLOW_PERMISSIONS.ALL, UPLOAD_PERMISSIONS.ALL] as const,

  /** Organization member - same as owner for now */
  ORGANIZATION_MEMBER: [FLOW_PERMISSIONS.ALL, UPLOAD_PERMISSIONS.ALL] as const,

  /** API key - limited to execute flows and create uploads */
  API_KEY: [FLOW_PERMISSIONS.EXECUTE, UPLOAD_PERMISSIONS.CREATE] as const,
} as const;

/**
 * Hierarchical permission relationships.
 * When a parent permission is granted, all child permissions are implied.
 */
export const PERMISSION_HIERARCHY: Record<string, readonly string[]> = {
  [ENGINE_PERMISSIONS.DLQ]: [
    ENGINE_PERMISSIONS.DLQ_READ,
    ENGINE_PERMISSIONS.DLQ_WRITE,
  ],
} as const;
