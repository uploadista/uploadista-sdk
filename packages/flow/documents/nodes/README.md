# @uploadista/flow-documents-nodes

Document processing nodes for Uploadista Flow engine.

## Features

- **OCR Node**: Extract text from scanned documents and images using AI
- **Extract Text Node**: Extract plain text from searchable PDFs
- **Split PDF Node**: Split PDFs by page range or into individual pages
- **Merge PDF Node**: Combine multiple PDFs into a single document
- **Describe Document Node**: Extract document metadata
- **Convert to Markdown Node**: Convert documents to Markdown format

## Installation

```bash
pnpm add @uploadista/flow-documents-nodes
```

## Usage

```typescript
import {
  createOcrNode,
  createExtractTextNode,
  createSplitPdfNode,
  createMergePdfNode,
  createDescribeDocumentNode,
  createConvertToMarkdownNode,
} from "@uploadista/flow-documents-nodes";

// Create an OCR node
const ocrNode = yield* createOcrNode("ocr-1", {
  taskType: "convertToMarkdown",
  resolution: "gundam",
  credentialId: "replicate-credential-id",
});

// Create an extract text node
const extractNode = yield* createExtractTextNode("extract-1", {});

// Create a split PDF node
const splitNode = yield* createSplitPdfNode("split-1", {
  mode: "range",
  startPage: 1,
  endPage: 5,
});
```

## Requirements

- **DocumentPlugin**: Required for PDF operations (split, merge, extract text, metadata)
- **DocumentAiPlugin**: Required for OCR operations

## License

MIT
