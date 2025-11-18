# @uploadista/flow-documents-pdflib

pdf-lib-based DocumentPlugin implementation for Uploadista Flow.

## Features

- Pure JavaScript implementation (no native dependencies)
- PDF splitting and merging
- Metadata extraction
- Works in both Node.js and browsers

## Installation

```bash
pnpm add @uploadista/flow-documents-pdflib
```

## Usage

```typescript
import { PdfLibDocumentPluginLive } from "@uploadista/flow-documents-pdflib";
import { Effect, Layer } from "effect";

// Provide the plugin to your flow execution
const program = Effect.gen(function* () {
  // Your flow logic here
}).pipe(Effect.provide(PdfLibDocumentPluginLive));
```

## Why pdf-lib?

- **Pure JavaScript**: No native binaries or external dependencies
- **Cross-platform**: Works in Node.js, browsers, and edge runtimes
- **Actively maintained**: MIT licensed with regular updates
- **Comprehensive**: Supports PDF creation, modification, and reading

## Limitations

pdf-lib has limited text extraction capabilities. For text extraction from searchable PDFs, use the unpdf plugin instead.

## License

MIT
