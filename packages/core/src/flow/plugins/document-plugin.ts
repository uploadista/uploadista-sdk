import { Context, type Effect, type Layer } from "effect";
import type { UploadistaError } from "../../errors";

/**
 * Parameters for splitting a PDF document.
 */
export type SplitPdfParams = {
  /**
   * Mode of split operation.
   * - "range": Extract a contiguous range of pages
   * - "individual": Split into individual single-page PDFs
   */
  mode: "range" | "individual";
  /**
   * Starting page number (1-indexed).
   * Only used in "range" mode.
   */
  startPage?: number;
  /**
   * Ending page number (1-indexed, inclusive).
   * Only used in "range" mode.
   */
  endPage?: number;
};

/**
 * Result of a split PDF operation.
 * In "range" mode, returns a single PDF.
 * In "individual" mode, returns an array of single-page PDFs.
 */
export type SplitPdfResult =
  | { mode: "range"; pdf: Uint8Array }
  | { mode: "individual"; pdfs: Uint8Array[] };

/**
 * Parameters for merging multiple PDF documents.
 */
export type MergePdfParams = {
  /**
   * Array of PDF documents to merge (in order).
   */
  pdfs: Uint8Array[];
};

/**
 * Metadata extracted from a PDF document.
 */
export type DocumentMetadata = {
  /**
   * Total number of pages in the document.
   */
  pageCount: number;
  /**
   * Document format (e.g., "pdf").
   */
  format: string;
  /**
   * Author of the document (if available).
   */
  author: string | null;
  /**
   * Title of the document (if available).
   */
  title: string | null;
  /**
   * Subject of the document (if available).
   */
  subject: string | null;
  /**
   * Creator application (if available).
   */
  creator: string | null;
  /**
   * Creation date in ISO 8601 format (if available).
   */
  creationDate: string | null;
  /**
   * Last modification date in ISO 8601 format (if available).
   */
  modifiedDate: string | null;
  /**
   * File size in bytes.
   */
  fileSize: number;
};

/**
 * Shape definition for the Document Plugin interface.
 * Defines the contract that all document processing implementations must follow.
 */
export type DocumentPluginShape = {
  /**
   * Extracts plain text from a searchable PDF document.
   *
   * @param input - The input PDF as a Uint8Array
   * @returns An Effect that resolves to the extracted text as a string
   * @throws {UploadistaError} When text extraction fails (e.g., PDF_ENCRYPTED, PDF_CORRUPTED)
   */
  extractText: (input: Uint8Array) => Effect.Effect<string, UploadistaError>;

  /**
   * Splits a PDF document by page range or into individual pages.
   *
   * @param input - The input PDF as a Uint8Array
   * @param options - Split parameters including mode and page range
   * @returns An Effect that resolves to either a single PDF or array of PDFs
   * @throws {UploadistaError} When splitting fails (e.g., PAGE_RANGE_INVALID)
   */
  splitPdf: (
    input: Uint8Array,
    options: SplitPdfParams,
  ) => Effect.Effect<SplitPdfResult, UploadistaError>;

  /**
   * Merges multiple PDF documents into a single document.
   *
   * @param options - Merge parameters including array of PDFs to merge
   * @returns An Effect that resolves to the merged PDF as a Uint8Array
   * @throws {UploadistaError} When merging fails
   */
  mergePdfs: (
    options: MergePdfParams,
  ) => Effect.Effect<Uint8Array, UploadistaError>;

  /**
   * Extracts metadata from a PDF document.
   *
   * @param input - The input PDF as a Uint8Array
   * @returns An Effect that resolves to DocumentMetadata with comprehensive document information
   * @throws {UploadistaError} When metadata extraction fails
   */
  getMetadata: (
    input: Uint8Array,
  ) => Effect.Effect<DocumentMetadata, UploadistaError>;
};

/**
 * Context tag for the Document Plugin.
 *
 * This tag provides a type-safe way to access document processing functionality
 * throughout the application using Effect's dependency injection system.
 *
 * @example
 * ```typescript
 * import { DocumentPlugin } from "@uploadista/core/flow/plugins";
 *
 * // In your flow node
 * const program = Effect.gen(function* () {
 *   const documentPlugin = yield* DocumentPlugin;
 *   const text = yield* documentPlugin.extractText(pdfData);
 *   const metadata = yield* documentPlugin.getMetadata(pdfData);
 *   return { text, metadata };
 * });
 * ```
 */
export class DocumentPlugin extends Context.Tag("DocumentPlugin")<
  DocumentPlugin,
  DocumentPluginShape
>() {}

export type DocumentPluginLayer = Layer.Layer<DocumentPlugin, never, never>;
