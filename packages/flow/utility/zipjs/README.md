# @uploadista/flow-utility-zipjs

Flow utility node for creating ZIP archives in Uploadista pipelines. Combines multiple files into compressed archives.

## Overview

The Zip node enables archiving workflows without custom code:

- **Archive Creation**: Combine files into ZIP archives
- **Compression**: Reduce total size
- **Batch Processing**: Archive multiple files at once
- **Format**: Standard ZIP format compatible everywhere

Perfect for backup, distribution, and batch delivery workflows.

## Installation

```bash
npm install @uploadista/flow-utility-zipjs
# or
pnpm add @uploadista/flow-utility-zipjs
```

## Quick Start

```typescript
import { zipNode } from "@uploadista/flow-utility-zipjs";

const flow = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "archive",
      type: "zip",
      params: {
        filename: "archive.zip",
        compressionLevel: 6,
      },
    },
    { id: "s3", type: "s3" },
    { id: "output", type: "output" },
  ],
  edges: [
    { from: "input", to: "archive" },
    { from: "archive", to: "s3" },
    { from: "s3", to: "output" },
  ],
};
```

## Features

- ✅ **ZIP Archives**: Standard compression format
- ✅ **Configurable**: Compression levels and naming
- ✅ **Streaming**: Memory-efficient processing
- ✅ **Metadata**: Preserve file information
- ✅ **Cross-Platform**: Works everywhere

## Node Parameters

```typescript
{
  filename: string,        // Output archive name
  compressionLevel?: 0-9,  // Compression (default: 6)
  comment?: string,        // ZIP comment
}
```

## Configuration

### Basic Archive

```typescript
{
  type: "zip",
  params: {
    filename: "backup.zip",
  },
}
```

### High Compression

```typescript
{
  type: "zip",
  params: {
    filename: "archive.zip",
    compressionLevel: 9,  // Maximum compression
  },
}
```

### With Metadata

```typescript
{
  type: "zip",
  params: {
    filename: "export.zip",
    comment: "Export from upload batch",
  },
}
```

## Use Cases

### Case 1: Backup Archive

```
Multiple Files → Zip ("backup.zip") → S3 Storage → Download
```

### Case 2: Distribution Package

```
Input Files → Zip ("release.zip") → CDN → Users
```

### Case 3: Batch Delivery

```
Batch Input → Merge → Zip ("batch.zip") → Email → Recipients
```

## Examples

### Example 1: Create Backup Archive

```typescript
const backupFlow = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "archive",
      type: "zip",
      params: {
        filename: "backup-2025-10-21.zip",
        compressionLevel: 9,
        comment: "Full backup archive",
      },
    },
    { id: "s3", type: "s3", params: { bucket: "backups" } },
    { id: "output", type: "output" },
  ],
  edges: [
    { from: "input", to: "archive" },
    { from: "archive", to: "s3" },
    { from: "s3", to: "output" },
  ],
};
```

### Example 2: Package Multiple Uploads

```typescript
const packageFlow = {
  nodes: [
    { id: "file1", type: "input" },
    { id: "file2", type: "input" },
    { id: "file3", type: "input" },
    {
      id: "merge",
      type: "merge",
      params: { strategy: "batch", inputCount: 3 },
    },
    {
      id: "zip",
      type: "zip",
      params: { filename: "package.zip" },
    },
    { id: "s3", type: "s3" },
    { id: "output", type: "output" },
  ],
  edges: [
    { from: "file1", to: "merge" },
    { from: "file2", to: "merge" },
    { from: "file3", to: "merge" },
    { from: "merge", to: "zip" },
    { from: "zip", to: "s3" },
    { from: "s3", to: "output" },
  ],
};
```

### Example 3: Conditional Archiving

```typescript
const conditionalArchive = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "isDocument",
      type: "conditional",
      params: {
        field: "mimeType",
        operator: "contains",
        value: "pdf",
      },
    },
    {
      id: "archive",
      type: "zip",
      params: { filename: "documents.zip" },
    },
    { id: "s3", type: "s3" },
    { id: "output", type: "output" },
  ],
  edges: [
    { from: "input", to: "isDocument" },
    { from: "isDocument", true: "archive", false: "s3" },
    { from: "archive", to: "s3" },
    { from: "s3", to: "output" },
  ],
};
```

## Performance

| Operation | Time |
|-----------|------|
| Small archive (< 100MB) | ~100ms |
| Medium archive (100-500MB) | ~500ms |
| Large archive (500MB-1GB) | ~2-5s |
| Compression Level 1 | ~50% faster |
| Compression Level 9 | ~50% slower, 20-30% smaller |

Compression level recommendations:
- Level 1-3: Speed priority (network bottleneck)
- Level 6: Default balance (recommended)
- Level 9: Size priority (cold storage)

## Best Practices

### 1. Choose Appropriate Compression

```typescript
// Fast for network delivery
{ compressionLevel: 3 }

// Balanced (recommended)
{ compressionLevel: 6 }

// Maximum for storage
{ compressionLevel: 9 }
```

### 2. Meaningful Archive Names

```typescript
// Good: Descriptive
"backup-2025-10-21.zip"
"export-users.zip"
"release-v1.0.0.zip"

// Avoid: Generic
"archive.zip"
"output.zip"
```

### 3. Monitor Archive Size

```typescript
// Check output before upload
const archiveSize = yield* getFileSize(archiveFile);

if (archiveSize > MAX_ARCHIVE_SIZE) {
  // Split into multiple archives
}
```

## Limitations

- **ZIP Format**: Limited to ZIP (no 7z, rar, etc)
- **Size Limits**: File size limited by available memory
- **Compression Overhead**: Small files may grow when archived
- **No Encryption**: Standard ZIP (optional encryption in future)

## Related Packages

- [@uploadista/flow-utility-nodes](../nodes) - Conditional routing
- [@uploadista/core](../../core) - Core flow types
- [@uploadista/flow-images-sharp](../images/sharp) - Image optimization
- [@uploadista/server](../../servers/server) - Upload server

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [FLOW_NODES.md](../FLOW_NODES.md) - All available nodes
- [Server Setup Guide](../../../SERVER_SETUP.md) - Flow integration
