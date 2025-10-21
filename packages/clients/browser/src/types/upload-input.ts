/**
 * Browser-specific upload input types that can be used with the Uploadista client.
 *
 * In the browser environment, files can be provided as either:
 * - `File` objects from file input elements or drag-and-drop
 * - `Blob` objects created programmatically or from other sources
 *
 * Both types use the browser's File API and can be chunked for upload.
 *
 * @example
 * ```typescript
 * // From file input
 * const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
 * const file: BrowserUploadInput = fileInput.files[0];
 *
 * // From drag and drop
 * element.addEventListener('drop', (e) => {
 *   const file: BrowserUploadInput = e.dataTransfer.files[0];
 * });
 *
 * // From Blob
 * const blob: BrowserUploadInput = new Blob(['content'], { type: 'text/plain' });
 * ```
 */
export type BrowserUploadInput = Blob | File;
