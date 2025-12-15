# @uploadista/flow-documents-nodes

Document processing nodes for Uploadista flows. Process PDFs with text extraction, OCR, splitting, merging, and conversion.

## Installation

```bash
npm install @uploadista/flow-documents-nodes
# or
pnpm add @uploadista/flow-documents-nodes
```

## Quick Start

```typescript
import {
  createOcrNode,
  createExtractTextNode,
  createSplitPdfNode,
  createMergePdfNode,
  createDescribeDocumentNode,
  createConvertToMarkdownNode,
} from "@uploadista/flow-documents-nodes";
```

## Node Types

### OCR Node

AI-powered text extraction from scanned documents.

```typescript
import { createOcrNode } from "@uploadista/flow-documents-nodes";

// Convert scanned document to markdown
const ocrNode = yield* createOcrNode("ocr-1", {
  taskType: "convertToMarkdown",
  resolution: "gundam",
  credentialId: "my-replicate-credential",
});

// Free-form OCR for plain text extraction
const freeOcrNode = yield* createOcrNode("ocr-2", {
  taskType: "freeOcr",
  resolution: "base",
});

// Locate specific content in document
const locateNode = yield* createOcrNode("ocr-3", {
  taskType: "locateObject",
  referenceText: "Invoice Total",
  resolution: "small",
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `taskType` | `"convertToMarkdown" \| "freeOcr" \| "parseFigure" \| "locateObject"` | Yes | - | OCR task type |
| `resolution` | `"tiny" \| "small" \| "base" \| "gundam" \| "large"` | No | - | Model resolution |
| `credentialId` | `string` | No | - | AI service credential ID |
| `referenceText` | `string` | No | - | Text to locate (for `locateObject` task) |
| `keepOutput` | `boolean` | No | `false` | Keep output in flow results |

#### Task Types

| Task Type | Description |
|-----------|-------------|
| `convertToMarkdown` | Structured markdown output with headings, lists |
| `freeOcr` | Unstructured plain text extraction |
| `parseFigure` | Analyze charts and diagrams |
| `locateObject` | Find specific content using reference text |

### Extract Text Node

Fast text extraction from searchable PDFs.

```typescript
import { createExtractTextNode } from "@uploadista/flow-documents-nodes";

// Extract text from searchable PDF
const extractNode = yield* createExtractTextNode("extract-1");

// With keepOutput option
const keepOutputNode = yield* createExtractTextNode("extract-2", {
  keepOutput: true,
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keepOutput` | `boolean` | No | `false` | Keep output in flow results |

**Output:** Adds `extractedText` to file metadata.

### Split PDF Node

Split PDFs by page range or into individual pages.

```typescript
import { createSplitPdfNode } from "@uploadista/flow-documents-nodes";

// Extract pages 3-5 as single PDF
const rangeNode = yield* createSplitPdfNode("split-1", {
  mode: "range",
  startPage: 3,
  endPage: 5,
});

// Split each page into separate PDF
const individualNode = yield* createSplitPdfNode("split-2", {
  mode: "individual",
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `mode` | `"range" \| "individual"` | Yes | - | Split mode |
| `startPage` | `number` | No | - | Start page (for range mode) |
| `endPage` | `number` | No | - | End page (for range mode) |
| `keepOutput` | `boolean` | No | `false` | Keep output in flow results |
| `naming` | `FileNamingConfig` | No | - | File naming configuration |

### Merge PDF Node

Combine multiple PDFs into a single document.

```typescript
import { createMergePdfNode } from "@uploadista/flow-documents-nodes";

// Merge PDFs with default settings
const mergeNode = yield* createMergePdfNode("merge-1");

// With custom naming
const namedMergeNode = yield* createMergePdfNode("merge-2", {
  naming: { mode: "auto" },
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputCount` | `number` | No | - | Expected number of input files |
| `keepOutput` | `boolean` | No | `false` | Keep output in flow results |
| `naming` | `FileNamingConfig` | No | - | File naming (auto suffix: `merged`) |

**Note:** Requires a Merge utility node upstream to provide multiple files.

### Describe Document Node

Extract PDF metadata (page count, author, title, etc.).

```typescript
import { createDescribeDocumentNode } from "@uploadista/flow-documents-nodes";

// Extract document metadata
const describeNode = yield* createDescribeDocumentNode("describe-1");
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keepOutput` | `boolean` | No | `false` | Keep output in flow results |

**Output Metadata:**
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

### Convert to Markdown Node

Intelligent document-to-markdown conversion.

```typescript
import { createConvertToMarkdownNode } from "@uploadista/flow-documents-nodes";

// Convert with default settings
const convertNode = yield* createConvertToMarkdownNode("convert-1");

// With custom resolution and credential
const customNode = yield* createConvertToMarkdownNode("convert-2", {
  resolution: "gundam",
  credentialId: "my-ai-credential",
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resolution` | `"tiny" \| "small" \| "base" \| "gundam" \| "large"` | No | `"gundam"` | OCR model resolution |
| `credentialId` | `string` | No | - | AI service credential ID |
| `keepOutput` | `boolean` | No | `false` | Keep output in flow results |

**How it Works:**
1. Tries text extraction first (fast, for searchable PDFs)
2. Falls back to OCR if no text found (for scanned PDFs)
3. Returns structured markdown in `metadata.markdown`

## Requirements

- **DocumentPlugin**: Required for PDF operations (split, merge, extract text, metadata)
- **DocumentAiPlugin**: Required for OCR and AI-powered conversion

## License

MIT
