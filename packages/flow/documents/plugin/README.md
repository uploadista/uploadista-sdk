# @uploadista/flow-documents-combined

Combined DocumentPlugin implementation using both pdf-lib and unpdf.

## Features

- **Text Extraction**: Uses unpdf for fast, accurate text extraction from searchable PDFs
- **PDF Manipulation**: Uses pdf-lib for splitting, merging, and metadata extraction
- **Complete Solution**: Single plugin that handles all document operations

## Installation

```bash
pnpm add @uploadista/flow-documents-combined
```

## Usage

```typescript
import { CombinedDocumentPluginLive } from "@uploadista/flow-documents-combined";
import { Effect } from "effect";

// Provide the combined plugin to your flow execution
const program = Effect.gen(function* () {
  // Your flow logic here - all DocumentPlugin operations work
}).pipe(Effect.provide(CombinedDocumentPluginLive));
```

## Why Use This?

Instead of managing separate plugins for different operations, this combined plugin gives you:

- One plugin to provide instead of two
- Automatic routing to the right implementation
- Simplified dependency management

## Under the Hood

- `extractText()` → unpdf (fast, accurate text extraction)
- `getMetadata()` → pdf-lib (comprehensive metadata)
- `splitPdf()` → pdf-lib (page manipulation)
- `mergePdfs()` → pdf-lib (document merging)

## License

MIT
