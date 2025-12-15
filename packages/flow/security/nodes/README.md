# @uploadista/flow-security-nodes

Security processing nodes for Uploadista flows. Includes virus scanning and malware detection.

## Installation

```bash
npm install @uploadista/flow-security-nodes
# or
pnpm add @uploadista/flow-security-nodes
```

## Quick Start

```typescript
import { createScanVirusNode } from "@uploadista/flow-security-nodes";
```

## Node Types

### Scan Virus Node

Scan files for viruses and malware using ClamAV.

```typescript
import { createScanVirusNode } from "@uploadista/flow-security-nodes";

// Fail flow if virus detected (recommended for production)
const scanNode = yield* createScanVirusNode("scan-1", {
  action: "fail",
  timeout: 60000,
});

// Continue with metadata (useful for logging/auditing)
const auditNode = yield* createScanVirusNode("scan-2", {
  action: "pass",
  timeout: 120000,
});

// With keepOutput option
const keepOutputNode = yield* createScanVirusNode("scan-3", {
  action: "fail",
}, {
  keepOutput: true,
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `action` | `"fail" \| "pass"` | No | `"fail"` | Action when virus detected |
| `timeout` | `number` (1000-300000) | No | `60000` | Max scan time in milliseconds |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `keepOutput` | `boolean` | `false` | Keep output in flow results |

#### Actions

| Action | Description |
|--------|-------------|
| `fail` | Stop flow execution when virus detected (recommended for production) |
| `pass` | Continue processing with detection metadata (useful for logging/auditing) |

#### Scan Results Metadata

All scan results are stored in `file.metadata.virusScan`:

```typescript
type VirusScanMetadata = {
  scanned: boolean;        // Whether file was scanned
  isClean: boolean;        // Whether file is clean (no viruses)
  detectedViruses: string[]; // Array of detected virus names
  scanDate: string;        // ISO 8601 timestamp
  engineVersion: string;   // Antivirus engine version
  definitionsDate: string; // Virus definitions date
};
```

#### Error Codes

| Error Code | Description |
|------------|-------------|
| `VIRUS_DETECTED` | Malware found in file (when action=fail) |
| `CLAMAV_NOT_INSTALLED` | ClamAV not available on system |
| `VIRUS_SCAN_FAILED` | Generic scanning operation failure |
| `SCAN_TIMEOUT` | Scanning exceeded timeout limit |

## Example Flow

```typescript
import { createFlow } from "@uploadista/core/flow";
import { createScanVirusNode } from "@uploadista/flow-security-nodes";
import { ClamScanPluginLayer } from "@uploadista/flow-security-clamscan";
import { Effect } from "effect";

const secureUploadFlow = createFlow({
  nodes: [
    // 1. Input node
    createInputNode("input-1"),

    // 2. Scan for viruses - fail if infected
    yield* createScanVirusNode("scan-1", {
      action: "fail",
      timeout: 60000,
    }),

    // 3. Process clean files
    yield* createResizeNode("resize-1", {
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

## Requirements

- **VirusScanPlugin**: Required for scanning (e.g., `@uploadista/flow-security-clamscan`)
- ClamAV installed on the system (daemon or binary)

See [@uploadista/flow-security-clamscan](../clamscan) for ClamAV plugin setup.

## License

MIT
