# Uploadista Flow Nodes Gallery

Complete guide to all available flow processing nodes.

## Node Categories

### Utility Nodes

Transform data flow and control logic.

#### Conditional Node
**Package**: `@uploadista/flow-utility-nodes`

Routes inputs based on file properties.

```typescript
{
  type: "conditional",
  params: {
    field: "mimeType" | "size" | "width" | "height" | "extension",
    operator: "equals" | "notEquals" | "greaterThan" | "lessThan" | "contains" | "startsWith",
    value: string | number,
  },
}
```

**Use Cases**:
- Route images to resize, documents to compress
- Size-based routing (large files differently)
- Format-specific processing

#### Merge Node
**Package**: `@uploadista/flow-utility-nodes`

Combine multiple inputs into batch.

```typescript
{
  type: "merge",
  params: {
    strategy: "concat" | "batch",
    inputCount: 2-10,
    separator?: string,
  },
}
```

**Use Cases**:
- Batch upload processing
- Combine files before archiving
- Wait for multiple inputs

#### Multiplex Node
**Package**: `@uploadista/flow-utility-nodes`

Split single input to multiple outputs.

```typescript
{
  type: "multiplex",
  params: {
    outputCount: 2-5,
  },
}
```

**Use Cases**:
- Multi-destination delivery (S3 + backup)
- Create multiple sizes simultaneously
- Parallel processing paths

#### Zip Node
**Package**: `@uploadista/flow-utility-zipjs`

Create ZIP archives.

```typescript
{
  type: "zip",
  params: {
    filename: string,
    compressionLevel?: 0-9,
    comment?: string,
  },
}
```

**Use Cases**:
- Archive multiple files
- Batch delivery
- Backup creation

### Security Nodes

Malware detection and file security scanning.

#### Scan Virus Node
**Package**: `@uploadista/flow-security-nodes`

Scan files for viruses and malware using ClamAV antivirus engine.

```typescript
{
  type: "scanVirus",
  params: {
    action: "fail" | "pass",
    timeout?: number, // milliseconds (default: 60000, max: 300000)
  },
}
```

**Actions**:
- `fail`: Stop flow execution when virus detected (recommended for production)
- `pass`: Continue processing with detection metadata (useful for logging/auditing)

**Use Cases**:
- Scan user-uploaded files before storage
- Protect file management systems from malware
- Audit uploaded content for security threats
- Prevent virus distribution through file sharing

**Example Flow**:
```typescript
import { createScanVirusNode } from "@uploadista/flow-security-nodes";
import { ClamScanPluginLayer } from "@uploadista/flow-security-clamscan";

// Fail on virus detection (production)
const scanNode = yield* createScanVirusNode("scan-1", {
  action: "fail",
  timeout: 60000,
});

// Pass with metadata (audit mode)
const auditNode = yield* createScanVirusNode("scan-audit", {
  action: "pass",
});

// Provide ClamAV plugin
const layer = ClamScanPluginLayer();
```

**Scan Results Metadata**:
All files scanned will have `virusScan` metadata added:
```typescript
{
  scanned: boolean,
  isClean: boolean,
  detectedViruses: string[],
  scanDate: string, // ISO 8601
  engineVersion: string,
  definitionsDate: string, // ISO 8601
}
```

**Performance**:
- Small files (<10MB): ~1-5 seconds
- Large files (>10MB): ~5-30 seconds (depends on file size)
- Daemon mode (clamd) is significantly faster than binary mode

**Requirements**:
- ClamAV must be installed on the host system
- For Docker: install `clamav` and `clamav-daemon` packages
- Virus definitions should be updated regularly (daily recommended)

**Plugin Options**:
```typescript
import { ClamScanPluginLayer } from "@uploadista/flow-security-clamscan";

// Default configuration (daemon preferred, fallback to binary)
const defaultLayer = ClamScanPluginLayer();

// Custom daemon configuration
const customLayer = ClamScanPluginLayer({
  preference: "clamdscan",
  clamdscan_socket: "/var/run/clamav/clamd.sock",
  clamdscan_port: 3310,
  debug_mode: false,
});

// Binary-only mode
const binaryLayer = ClamScanPluginLayer({
  preference: "clamscan",
});
```

**Error Codes**:
- `VIRUS_DETECTED`: Malware found in file (when action=fail)
- `CLAMAV_NOT_INSTALLED`: ClamAV not available on system
- `VIRUS_SCAN_FAILED`: Generic scanning operation failure
- `SCAN_TIMEOUT`: Scanning exceeded timeout limit

**Best Practices**:
1. Always scan before storing user uploads
2. Use `action: "fail"` in production environments
3. Set appropriate timeouts for expected file sizes
4. Keep virus definitions up to date (use `freshclam` cron job)
5. Monitor ClamAV daemon health in production
6. Consider file size limits to prevent DoS via large files

**Testing**:
Use the EICAR test file for testing without real malware:
```typescript
// EICAR is a safe test signature recognized by all AV engines
const eicarSignature = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
```

**ClamAV Installation**:

Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install clamav clamav-daemon
sudo freshclam  # Update virus definitions
sudo systemctl enable clamav-daemon
sudo systemctl start clamav-daemon
```

macOS (Homebrew):
```bash
brew install clamav
freshclam  # Update virus definitions
```

Docker:
```dockerfile
FROM node:24-slim
RUN apt-get update && apt-get install -y clamav clamav-daemon
RUN freshclam
RUN mkdir -p /var/run/clamav && chown clamav:clamav /var/run/clamav
CMD ["node", "dist/index.js"]
```

**Troubleshooting**:
- **"ClamAV not installed"**: Install ClamAV or check PATH
- **"Virus definitions outdated"**: Run `freshclam` to update
- **"Scan timeout"**: Increase timeout or optimize ClamAV config
- **Daemon connection failed**: Check clamd is running (`systemctl status clamav-daemon`)
- **Permission denied**: Ensure user has access to clamd socket

### Image Processing Nodes

Image optimization and transformation.

#### Resize Node
**Package**: `@uploadista/flow-images-sharp` or `@uploadista/flow-images-photon`

Scale images to dimensions.

```typescript
{
  type: "resize",
  params: {
    width?: number,
    height?: number,
    fit: "cover" | "contain" | "fill",
  },
}
```

**Use Cases**:
- Create thumbnails
- Generate responsive variants (mobile/tablet/desktop)
- Normalize image sizes

**Sharp (Node.js)**: ~50-100ms
**Photon (Edge)**: ~5-10ms

#### Optimize Node
**Package**: `@uploadista/flow-images-sharp` or `@uploadista/flow-images-photon`

Compress and convert images.

```typescript
{
  type: "optimize",
  params: {
    quality: 1-100,
    format: "jpeg" | "png" | "webp" | "avif",
  },
}
```

**Use Cases**:
- Reduce file size
- Convert format (JPEG → WebP)
- Auto-format selection by browser

**Recommended Settings**:
- `quality: 85, format: "webp"` for balance
- `quality: 90, format: "jpeg"` for compatibility
- `quality: 75, format: "avif"` for maximum compression

#### Describe Image Node
**Package**: `@uploadista/flow-images-nodes`

Extract image metadata.

```typescript
{
  type: "describe-image",
  params: {},
}
```

**Output**:
```json
{
  "width": 1920,
  "height": 1080,
  "format": "jpeg",
  "space": "srgb",
  "channels": 3,
  "depth": 8,
  "hasAlpha": false,
  "exif": { /* EXIF data */ }
}
```

**Use Cases**:
- Index image dimensions
- Extract camera info
- Validation before processing

#### Remove Background Node
**Package**: `@uploadista/flow-images-replicate`

AI background removal.

```typescript
{
  type: "remove-background",
  params: {
    model: "rembg",
    returnFormat: "png",
  },
}
```

**Use Cases**:
- E-commerce product images
- Avatar generation
- Professional headshots

**Time**: ~5-15s | **Cost**: ~$0.001-0.002

#### Upscale Node
**Package**: `@uploadista/flow-images-replicate`

Enhance image resolution.

```typescript
{
  type: "upscale",
  params: {
    scale: 2 | 4,
    model: "real-esrgan",
  },
}
```

**Use Cases**:
- Improve low-resolution images
- Retina display preparation
- Photo enhancement

**Time**: ~10-20s | **Cost**: ~$0.01-0.05

#### Wait for URL Node
**Package**: `@uploadista/flow-images-nodes`

Load image from external URL.

```typescript
{
  type: "wait-for-url",
  params: {
    timeout: 30000,
  },
}
```

**Use Cases**:
- Process remote images
- Third-party image sources
- API-provided content

## Node Comparison

| Node | Speed | Cost | Backend |
|------|-------|------|---------|
| Resize (Sharp) | 50-100ms | Free | Node.js |
| Resize (Photon) | 5-10ms | Free | Edge |
| Optimize | 100-200ms | Free | Sharp/Photon |
| Remove BG | 5-15s | $0.001 | AI/Replicate |
| Upscale | 10-20s | $0.01 | AI/Replicate |
| Describe | 10-20ms | Free | Sharp |
| Merge | Instant | Free | Memory |
| Conditional | Instant | Free | Memory |
| Multiplex | Instant | Free | Memory |
| Zip | ~100-200ms | Free | CPU |

## Architecture Patterns

### Pattern 1: Responsive Images

Create multiple sizes for different devices:

```
Input → Multiplex (3 outputs)
        ├─ Resize 400×300 (mobile)
        ├─ Resize 800×600 (tablet)
        └─ Resize 1200×900 (desktop)
        → Output
```

### Pattern 2: Smart Routing

Route based on file type:

```
Input → Conditional (mimeType contains "image"?)
        ├─ YES: Resize + Optimize → S3
        └─ NO: Archive → Long-term storage
        → Output
```

### Pattern 3: Multi-Destination

Same image to multiple backends:

```
Input → Multiplex (2 outputs)
        ├─ S3 (primary)
        └─ GCS (backup)
        → Output
```

### Pattern 4: Batch Archiving

Multiple files to archive:

```
File 1 ┐
File 2 ├─ Merge (batch) → Zip → S3 → Output
File 3 ┘
```

### Pattern 5: AI Enhancement

Product image processing:

```
Input → Remove BG → Upscale → Optimize → S3 → Output
        (clean)    (quality) (size)
```

## Selection Guide

### Choose Sharp (Node.js) When

- Running on Node.js servers
- Speed critical (sub-100ms)
- Cost sensitive (free)
- Simple operations
- Self-hosted preference

**Best For**: Node.js/Fastify/Express servers

### Choose Photon (Edge) When

- Using Cloudflare Workers
- Global users
- Need instant response
- Value simplicity
- Built-in Workers benefit

**Best For**: Cloudflare Workers deployments

### Choose Replicate (AI) When

- Need AI capabilities
- Value accuracy over speed
- Budget allows per-request cost
- Advanced operations
- Batch processing acceptable

**Best For**: E-commerce, creative, professional use cases

## Performance Benchmarks

### Resize Performance
| Size | Sharp | Photon |
|------|-------|--------|
| 1MB | 50ms | 5ms |
| 5MB | 150ms | 10ms |
| 10MB | 250ms | 15ms |

### Format Conversion
| Operation | Time | Size Reduction |
|-----------|------|----------------|
| JPEG→WebP | 100ms | 30-40% |
| JPEG→AVIF | 150ms | 50-60% |
| PNG→WebP | 80ms | 20-30% |

### AI Operations
| Operation | Time | Cost |
|-----------|------|------|
| Remove BG | 5-15s | $0.002 |
| Upscale 2x | 10s | $0.02 |
| Upscale 4x | 20s | $0.05 |

## Configuration Examples

### E-Commerce Flow

```typescript
{
  nodes: [
    { id: "input", type: "input" },
    // Clean background for product
    { id: "bg", type: "remove-background", params: { model: "rembg" } },
    // Create variants
    { id: "split", type: "multiplex", params: { outputCount: 3 } },
    { id: "thumb", type: "resize", params: { width: 200, height: 200, fit: "cover" } },
    { id: "medium", type: "resize", params: { width: 600, height: 600, fit: "contain" } },
    { id: "full", type: "optimize", params: { quality: 90, format: "webp" } },
    // Store
    { id: "s3", type: "s3" },
    { id: "output", type: "output" },
  ],
}
```

### Content Delivery Flow

```typescript
{
  nodes: [
    { id: "input", type: "input" },
    // Multi-destination
    { id: "split", type: "multiplex", params: { outputCount: 2 } },
    // CDN + Backup
    { id: "cdn", type: "cloudflare", params: { zone: "primary" } },
    { id: "backup", type: "gcs", params: { bucket: "backup" } },
    { id: "output", type: "output" },
  ],
}
```

## Best Practices

1. **Order Matters**: Describe → Route → Process → Store
2. **Quality Balance**: 85 quality is optimal for most cases
3. **Format Selection**: WebP for modern browsers, JPEG for compatibility
4. **Size Strategy**:
   - Thumbnails: 200×200
   - Previews: 600×600
   - Full: 1200×1200
5. **Error Handling**: Always have fallback paths

### Document Processing Nodes

Process PDF documents with text extraction, OCR, and manipulation.

#### OCR Node
**Package**: `@uploadista/flow-documents-nodes`

AI-powered text extraction from scanned documents and images.

```typescript
{
  type: "ocr",
  params: {
    taskType: "convertToMarkdown" | "freeOcr" | "parseFigure" | "locateObject",
    resolution: "tiny" | "small" | "base" | "gundam" | "large",
    credentialId: string,
    referenceText?: string,
  },
}
```

**Task Types**:
- `convertToMarkdown`: Structured markdown output with headings, lists
- `freeOcr`: Unstructured plain text extraction
- `parseFigure`: Analyze charts and diagrams
- `locateObject`: Find specific content using reference text

**Use Cases**:
- Extract text from scanned invoices, receipts
- Convert documents to structured markdown
- Parse charts and technical diagrams
- Search for specific content in scanned documents

**Time**: ~5-15s | **Cost**: ~$0.005 per document

#### Extract Text Node
**Package**: `@uploadista/flow-documents-nodes`

Fast text extraction from searchable PDFs.

```typescript
{
  type: "extractText",
  params: {},
}
```

**Output**: Adds `extractedText` to file metadata

**Use Cases**:
- Extract text from searchable PDFs for indexing
- Parse PDF documents for content analysis
- Extract structured text with paragraphs preserved

**Time**: <1s | **Cost**: Free

**Note**: For scanned PDFs, use OCR Node instead.

#### Split PDF Node
**Package**: `@uploadista/flow-documents-nodes`

Split PDFs by page range or into individual pages.

```typescript
{
  type: "splitPdf",
  params: {
    mode: "range" | "individual",
    startPage: number,
    endPage: number,
  },
}
```

**Modes**:
- `range`: Extract pages 3-5 as single PDF
- `individual`: Split each page into separate PDF

**Use Cases**:
- Extract specific pages from large documents
- Split multi-page documents for parallel processing
- Create individual files for each page

**Time**: <2s | **Cost**: Free

#### Merge PDF Node
**Package**: `@uploadista/flow-documents-nodes`

Combine multiple PDFs into a single document.

```typescript
{
  type: "mergePdf",
  params: {
    inputCount: 2-10,
  },
}
```

**Requires**: Merge utility node to provide multiple files

**Use Cases**:
- Combine related documents
- Create document collections
- Merge split documents back together

**Time**: <2s | **Cost**: Free

#### Describe Document Node
**Package**: `@uploadista/flow-documents-nodes`

Extract comprehensive PDF metadata.

```typescript
{
  type: "describeDocument",
  params: {},
}
```

**Output Metadata**:
```json
{
  "pageCount": 10,
  "format": "pdf",
  "author": "John Doe",
  "title": "Document Title",
  "subject": "Document Subject",
  "creator": "Adobe Acrobat",
  "creationDate": "2023-01-01T00:00:00Z",
  "modifiedDate": "2023-01-02T00:00:00Z",
  "fileSize": 1024000
}
```

**Use Cases**:
- Index document properties
- Validate document metadata
- Extract creation dates and authors

**Time**: <1s | **Cost**: Free

#### Convert to Markdown Node
**Package**: `@uploadista/flow-documents-nodes`

Intelligent document-to-markdown conversion.

```typescript
{
  type: "convertToMarkdown",
  params: {
    credentialId?: string,
    resolution?: "tiny" | "small" | "base" | "gundam" | "large",
  },
}
```

**How it Works**:
1. Tries text extraction first (fast, searchable PDFs)
2. Falls back to OCR if no text found (scanned PDFs)
3. Returns structured markdown

**Use Cases**:
- Convert documents to markdown for CMS
- Extract structured content for processing
- Create markdown documentation from PDFs

**Time**: <1s (searchable) or ~5-15s (scanned) | **Cost**: Free or ~$0.005

## Document Processing Patterns

### Pattern 1: Invoice Processing

Extract data from scanned invoices:

```
Input → OCR (convertToMarkdown) → Conditional (amount > $1000?)
        ├─ YES: Flag for review
        └─ NO: Auto-process
        → Store → Output
```

### Pattern 2: Document Archival

Merge and archive multiple documents:

```
File 1 ┐
File 2 ├─ Merge → Describe → Storage (archive bucket) → Output
File 3 ┘
```

### Pattern 3: Text Extraction Pipeline

Extract text from mixed document types:

```
Input → Describe → Conditional (has text?)
        ├─ YES: Extract Text (fast)
        └─ NO: OCR (scanned)
        → Store metadata → Output
```

### Pattern 4: Page Selection

Extract specific pages from documents:

```
Input → Describe → Split (pages 1-5) → Process → Output
```

## Document Node Comparison

| Node | Speed | Cost | Best For |
|------|-------|------|----------|
| OCR | 5-15s | $0.005 | Scanned documents, images |
| Extract Text | <1s | Free | Searchable PDFs |
| Split PDF | <2s | Free | Page extraction |
| Merge PDF | <2s | Free | Combining documents |
| Describe | <1s | Free | Metadata extraction |
| Convert Markdown | 1-15s | Free-$0.005 | CMS integration |

## When to Use Which?

### OCR vs Extract Text
- **Extract Text**: For searchable PDFs with embedded text (fast, free)
- **OCR**: For scanned documents, images, or image-based PDFs (AI-powered)
- **Convert to Markdown**: Automatic detection - tries extract text first, falls back to OCR

### Split vs Merge
- **Split**: Break documents into pieces (page selection, parallel processing)
- **Merge**: Combine documents (archival, bundling)

## Related Packages

- [@uploadista/flow-utility-nodes](./utility/nodes/README.md)
- [@uploadista/flow-utility-zipjs](./utility/zipjs/README.md)
- [@uploadista/flow-images-nodes](./images/nodes/README.md)
- [@uploadista/flow-images-sharp](./images/sharp/README.md)
- [@uploadista/flow-images-photon](./images/photon/README.md)
- [@uploadista/flow-images-replicate](./images/replicate/README.md)
- [@uploadista/flow-documents-nodes](./documents/nodes/README.md)
- [@uploadista/flow-documents-pdflib](./documents/pdflib/README.md)
- [@uploadista/flow-documents-unpdf](./documents/unpdf/README.md)
- [@uploadista/flow-documents-replicate](./documents/replicate/README.md)
- [@uploadista/flow-documents-combined](./documents/combined/README.md)

## See Also

- [Server Setup Guide](../../SERVER_SETUP.md) - Flow integration
- [Core Flow Types](../core/flow) - Flow interfaces
