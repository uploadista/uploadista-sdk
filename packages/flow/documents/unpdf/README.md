# @uploadista/flow-documents-unpdf

unpdf-based text extraction plugin for Uploadista Flow.

## Features

- Fast text extraction from searchable PDFs
- Modern TypeScript-first API
- Async/await support
- Multi-page text extraction with structure preservation

## Installation

```bash
pnpm add @uploadista/flow-documents-unpdf
```

## Usage

```typescript
import { UnpdfDocumentPluginLive } from "@uploadista/flow-documents-unpdf";
import { Effect } from "effect";

// Provide the plugin for text extraction
const program = Effect.gen(function* () {
  // Your flow logic here
}).pipe(Effect.provide(UnpdfDocumentPluginLive));
```

## Why unpdf?

- **Modern**: TypeScript-first library maintained as an alternative to pdf-parse
- **Reliable**: Uses pdfjs-dist under the hood (Mozilla's PDF.js)
- **Fast**: Optimized for text extraction performance
- **Universal**: Works across all JavaScript runtimes

## Use Cases

- Extract text from searchable PDFs for indexing
- Parse PDF documents for content analysis
- Extract structured text with paragraph/line preservation

## When NOT to use

- For scanned documents or image-based PDFs (use OCR instead)
- For PDF manipulation (use pdf-lib instead)

## License

MIT
