# @uploadista/flow-documents-replicate

Replicate AI-powered OCR plugin for Uploadista Flow.

## Features

- **DeepSeek-OCR**: State-of-the-art OCR accuracy
- **Multiple task modes**: Markdown conversion, free OCR, figure parsing, object location
- **Configurable resolution**: Speed/accuracy tradeoff options
- **Cost-effective**: ~$0.005 per request (median)

## Installation

```bash
pnpm add @uploadista/flow-documents-replicate
```

## Usage

```typescript
import { ReplicateDocumentAiPluginLive } from "@uploadista/flow-documents-replicate";
import { Effect } from "effect";

// Provide the plugin to your flow execution
const program = Effect.gen(function* () {
  // Your flow logic here
}).pipe(Effect.provide(ReplicateDocumentAiPluginLive));
```

## OCR Task Types

### Convert to Markdown
Extracts text with structure (headings, lists, paragraphs) in Markdown format.

**Best for**: Documents, reports, articles

### Free OCR
Extracts all visible text without structure.

**Best for**: Simple text extraction, receipts, forms

### Parse Figure
Analyzes charts, diagrams, and visual elements.

**Best for**: Technical documents, presentations, infographics

### Locate Object
Finds specific content using reference text.

**Best for**: Searching for specific information in documents

## Resolution Options

- **tiny**: Fastest, lowest accuracy
- **small**: Fast, moderate accuracy
- **base**: Balanced speed/accuracy
- **gundam**: Recommended (default)
- **large**: Slowest, highest accuracy

## Requirements

- Replicate API key (credential required)
- Internet connection for API calls

## Pricing

Approximately $0.005 per document (median cost). Actual cost depends on document complexity and resolution.

## License

MIT
