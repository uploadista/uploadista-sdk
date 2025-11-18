import { Context, type Effect, type Layer } from "effect";
import type { UploadistaError } from "../../errors";

/**
 * Context information for AI document processing operations.
 * Contains client identification and credentials for tracking and billing purposes.
 */
export type DocumentAiContext = {
  /** Unique identifier for the client making the request, or null if not available */
  clientId: string | null;
  /** Credential ID for accessing the AI service (e.g., Replicate API key) */
  credentialId?: string;
};

/**
 * Task types supported by OCR operations.
 */
export type OcrTaskType =
  | "convertToMarkdown"
  | "freeOcr"
  | "parseFigure"
  | "locateObject";

/**
 * Resolution options for OCR processing.
 * Higher resolutions provide better accuracy but slower processing.
 */
export type OcrResolution = "tiny" | "small" | "base" | "gundam" | "large";

/**
 * Parameters for OCR operations.
 */
export type OcrParams = {
  /**
   * Type of OCR task to perform.
   * - "convertToMarkdown": Convert document to structured Markdown
   * - "freeOcr": Extract all visible text without structure
   * - "parseFigure": Analyze charts and diagrams
   * - "locateObject": Find specific content using reference text
   */
  taskType: OcrTaskType;
  /**
   * Resolution size for processing.
   * Affects speed/accuracy tradeoff.
   * Default: "gundam" (recommended)
   */
  resolution?: OcrResolution;
  /**
   * Reference text for object location tasks.
   * Only used when taskType is "locateObject".
   */
  referenceText?: string;
};

/**
 * Result of an OCR operation.
 */
export type OcrResult = {
  /**
   * The extracted text content.
   */
  extractedText: string;
  /**
   * Format of the extracted text.
   * - "markdown": Structured markdown format
   * - "plain": Unstructured plain text
   * - "structured": Structured analysis (for figures)
   */
  format: "markdown" | "plain" | "structured";
  /**
   * Confidence score (0-1) if provided by the service.
   */
  confidence?: number;
};

/**
 * Shape definition for the Document AI Plugin interface.
 * Defines the contract that all document AI implementations must follow.
 */
export type DocumentAiPluginShape = {
  /**
   * Performs OCR on a document image or scanned PDF using AI.
   *
   * @param inputUrl - The URL of the input document/image to process
   * @param params - OCR parameters including task type and resolution
   * @param context - Context information including client ID for tracking
   * @returns An Effect that resolves to OcrResult with extracted text
   * @throws {UploadistaError} When OCR operation fails
   */
  performOCR: (
    inputUrl: string,
    params: OcrParams,
    context: DocumentAiContext,
  ) => Effect.Effect<OcrResult, UploadistaError>;
};

/**
 * Context tag for the Document AI Plugin.
 *
 * This tag provides a type-safe way to access document AI functionality
 * throughout the application using Effect's dependency injection system.
 *
 * @example
 * ```typescript
 * import { DocumentAiPlugin } from "@uploadista/core/flow/plugins";
 *
 * // In your flow node
 * const program = Effect.gen(function* () {
 *   const documentAi = yield* DocumentAiPlugin;
 *   const result = yield* documentAi.performOCR(
 *     documentUrl,
 *     { taskType: "convertToMarkdown", resolution: "gundam" },
 *     { clientId: "user123" }
 *   );
 *   return result.extractedText;
 * });
 * ```
 */
export class DocumentAiPlugin extends Context.Tag("DocumentAiPlugin")<
  DocumentAiPlugin,
  DocumentAiPluginShape
>() {}

export type DocumentAiPluginLayer = Layer.Layer<DocumentAiPlugin, never, never>;
