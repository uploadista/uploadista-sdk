# @uploadista/flow-security-nodes

Security processing nodes for Uploadista Flow, including virus scanning and malware detection.

## Installation

```bash
npm install @uploadista/flow-security-nodes
# or
pnpm add @uploadista/flow-security-nodes
# or
yarn add @uploadista/flow-security-nodes
```

## Features

- **Virus Scanning**: Scan files for viruses and malware using pluggable antivirus engines
- **Configurable Actions**: Choose to fail flow or continue with metadata on virus detection
- **Effect-based**: Built on Effect-TS for type-safe, composable error handling
- **Plugin Architecture**: Support for multiple antivirus engines (ClamAV, cloud services, etc.)

## Available Nodes

### Scan Virus Node

Scans files for viruses and malware. Requires a `VirusScanPlugin` implementation (e.g., `@uploadista/flow-security-clamscan`).

#### Usage

```typescript
import { createScanVirusNode } from "@uploadista/flow-security-nodes";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  // Create a scan virus node that fails on detection
  const scanNode = yield* createScanVirusNode("virus-scan-1", {
    action: "fail", // Stop flow if virus detected
    timeout: 60000, // 60 second timeout
  });

  // Or create a node that passes with metadata
  const auditNode = yield* createScanVirusNode("virus-scan-2", {
    action: "pass", // Continue flow even if virus detected
    timeout: 120000, // 2 minute timeout for large files
  });
});
```

#### Parameters

- `id` (required): Unique node identifier
- `params` (optional): Configuration object
  - `action`: `"fail"` | `"pass"` (default: `"fail"`)
    - `"fail"`: Mark flow task as FAILED and stop processing when virus detected
    - `"pass"`: Continue processing but add virus metadata to file
  - `timeout`: Maximum scan time in milliseconds (default: 60000, max: 300000)

#### Scan Metadata

All scan results are stored in `file.metadata.virusScan`:

```typescript
type VirusScanMetadata = {
  scanned: boolean; // Whether file was scanned
  isClean: boolean; // Whether file is clean (no viruses)
  detectedViruses: string[]; // Array of detected virus names
  scanDate: string; // ISO 8601 timestamp
  engineVersion: string; // Antivirus engine version
  definitionsDate: string; // Virus definitions date
};
```

#### Example Flow

```typescript
import { createFlow } from "@uploadista/core/flow";
import { createScanVirusNode } from "@uploadista/flow-security-nodes";
import { ClamScanPluginLayer } from "@uploadista/flow-security-clamscan";

const secureUploadFlow = createFlow({
  nodes: [
    // 1. Input node
    createInputNode("input-1"),

    // 2. Scan for viruses - fail if infected
    createScanVirusNode("scan-1", {
      action: "fail",
      timeout: 60000,
    }),

    // 3. Process clean files
    createImageResizeNode("resize-1", {
      width: 1920,
      height: 1080,
    }),

    // 4. Store to S3
    createStorageNode("storage-1", {
      storageId: "my-s3-bucket",
    }),
  ],
  edges: [
    { source: "input-1", target: "scan-1" },
    { source: "scan-1", target: "resize-1" },
    { source: "resize-1", target: "storage-1" },
  ],
}).pipe(Effect.provide(ClamScanPluginLayer()));
```

## Error Codes

The scan virus node may return the following error codes:

- `VIRUS_DETECTED`: Virus or malware detected in file (when `action: "fail"`)
- `VIRUS_SCAN_FAILED`: Generic scanning operation failure
- `CLAMAV_NOT_INSTALLED`: ClamAV or configured antivirus not available
- `SCAN_TIMEOUT`: Scanning exceeded timeout limit

## Requirements

This package requires a `VirusScanPlugin` implementation. See [@uploadista/flow-security-clamscan](../clamscan) for ClamAV support.

## TypeScript

This package is written in TypeScript and includes full type definitions.

## License

MIT
