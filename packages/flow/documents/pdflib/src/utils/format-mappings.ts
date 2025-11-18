/**
 * PDF MIME type constant
 */
export const PDF_MIME_TYPE = "application/pdf";

/**
 * PDF file extension
 */
export const PDF_EXTENSION = ".pdf";

/**
 * Get MIME type for PDF format
 */
export function getPdfMimeType(): string {
  return PDF_MIME_TYPE;
}

/**
 * Get file extension for PDF format
 */
export function getPdfExtension(): string {
  return PDF_EXTENSION;
}
