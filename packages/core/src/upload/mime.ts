/**
 * Helper to check if buffer matches a byte pattern at given offset
 */
function checkBytes(
  buffer: Uint8Array,
  pattern: number[],
  offset = 0,
): boolean {
  if (buffer.length < offset + pattern.length) return false;
  return pattern.every((byte, i) => buffer[offset + i] === byte);
}

/**
 * Helper to check if buffer matches a string pattern at given offset
 */
function checkString(buffer: Uint8Array, str: string, offset = 0): boolean {
  if (buffer.length < offset + str.length) return false;
  for (let i = 0; i < str.length; i++) {
    if (buffer[offset + i] !== str.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Detect MIME type from buffer using magic bytes (file signatures).
 * Supports a wide range of common file types including images, videos, audio, documents, and archives.
 *
 * @param buffer - File content as Uint8Array
 * @param filename - Optional filename for extension-based fallback
 * @returns Detected MIME type or "application/octet-stream" if unknown
 */
export const detectMimeType = (
  buffer: Uint8Array,
  filename?: string,
): string => {
  if (buffer.length === 0) {
    return "application/octet-stream";
  }

  // ===== IMAGES =====

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (checkBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (checkBytes(buffer, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  // GIF87a or GIF89a
  if (checkString(buffer, "GIF87a") || checkString(buffer, "GIF89a")) {
    return "image/gif";
  }

  // WebP: RIFF....WEBP
  if (
    checkBytes(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.length >= 12 &&
    checkString(buffer, "WEBP", 8)
  ) {
    return "image/webp";
  }

  // AVIF: ....ftypavif or ....ftypavis
  if (
    buffer.length >= 12 &&
    checkBytes(buffer, [0x00, 0x00, 0x00], 0) &&
    checkString(buffer, "ftyp", 4) &&
    (checkString(buffer, "avif", 8) || checkString(buffer, "avis", 8))
  ) {
    return "image/avif";
  }

  // HEIC/HEIF: ....ftypheic or ....ftypheif or ....ftypmif1
  if (
    buffer.length >= 12 &&
    checkString(buffer, "ftyp", 4) &&
    (checkString(buffer, "heic", 8) ||
      checkString(buffer, "heif", 8) ||
      checkString(buffer, "mif1", 8))
  ) {
    return "image/heic";
  }

  // BMP: 42 4D
  if (checkBytes(buffer, [0x42, 0x4d])) {
    return "image/bmp";
  }

  // TIFF (little-endian): 49 49 2A 00
  if (checkBytes(buffer, [0x49, 0x49, 0x2a, 0x00])) {
    return "image/tiff";
  }

  // TIFF (big-endian): 4D 4D 00 2A
  if (checkBytes(buffer, [0x4d, 0x4d, 0x00, 0x2a])) {
    return "image/tiff";
  }

  // ICO: 00 00 01 00
  if (checkBytes(buffer, [0x00, 0x00, 0x01, 0x00])) {
    return "image/x-icon";
  }

  // SVG (XML-based, check for <svg or <?xml)
  if (buffer.length >= 5) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      buffer.slice(0, Math.min(1024, buffer.length)),
    );
    if (
      text.includes("<svg") ||
      (text.includes("<?xml") && text.includes("<svg"))
    ) {
      return "image/svg+xml";
    }
  }

  // ===== VIDEOS =====

  // MP4/M4V/M4A: ....ftyp
  if (buffer.length >= 12 && checkString(buffer, "ftyp", 4)) {
    const subtype = new TextDecoder().decode(buffer.slice(8, 12));
    if (
      subtype.startsWith("mp4") ||
      subtype.startsWith("M4") ||
      subtype.startsWith("isom")
    ) {
      return "video/mp4";
    }
  }

  // WebM: 1A 45 DF A3
  if (checkBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return "video/webm";
  }

  // AVI: RIFF....AVI
  if (
    checkBytes(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.length >= 12 &&
    checkString(buffer, "AVI ", 8)
  ) {
    return "video/x-msvideo";
  }

  // MOV (QuickTime): ....moov or ....mdat or ....free
  if (
    buffer.length >= 8 &&
    (checkString(buffer, "moov", 4) ||
      checkString(buffer, "mdat", 4) ||
      checkString(buffer, "free", 4))
  ) {
    return "video/quicktime";
  }

  // MKV: 1A 45 DF A3 (same as WebM but check for Matroska)
  if (checkBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3]) && buffer.length >= 100) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      buffer.slice(0, 100),
    );
    if (text.includes("matroska")) {
      return "video/x-matroska";
    }
  }

  // ===== AUDIO =====

  // MP3: FF FB or FF F3 or FF F2 or ID3
  if (
    checkBytes(buffer, [0xff, 0xfb]) ||
    checkBytes(buffer, [0xff, 0xf3]) ||
    checkBytes(buffer, [0xff, 0xf2]) ||
    checkString(buffer, "ID3")
  ) {
    return "audio/mpeg";
  }

  // WAV: RIFF....WAVE
  if (
    checkBytes(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.length >= 12 &&
    checkString(buffer, "WAVE", 8)
  ) {
    return "audio/wav";
  }

  // FLAC: 66 4C 61 43 (fLaC)
  if (checkString(buffer, "fLaC")) {
    return "audio/flac";
  }

  // OGG: 4F 67 67 53 (OggS)
  if (checkString(buffer, "OggS")) {
    return "audio/ogg";
  }

  // M4A: ....ftypM4A
  if (
    buffer.length >= 12 &&
    checkString(buffer, "ftyp", 4) &&
    checkString(buffer, "M4A", 8)
  ) {
    return "audio/mp4";
  }

  // ===== DOCUMENTS =====

  // PDF: 25 50 44 46 (%PDF)
  if (checkString(buffer, "%PDF")) {
    return "application/pdf";
  }

  // ===== ARCHIVES =====

  // ZIP: 50 4B 03 04 or 50 4B 05 06 (empty archive) or 50 4B 07 08 (spanned archive)
  if (
    checkBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    checkBytes(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    checkBytes(buffer, [0x50, 0x4b, 0x07, 0x08])
  ) {
    // Could be ZIP, DOCX, XLSX, PPTX, JAR, APK, etc.
    // Check for Office formats
    if (buffer.length >= 1024) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      if (text.includes("word/"))
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (text.includes("xl/"))
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (text.includes("ppt/"))
        return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    }
    return "application/zip";
  }

  // RAR: 52 61 72 21 1A 07 (Rar!)
  if (checkBytes(buffer, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) {
    return "application/x-rar-compressed";
  }

  // 7Z: 37 7A BC AF 27 1C
  if (checkBytes(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return "application/x-7z-compressed";
  }

  // GZIP: 1F 8B
  if (checkBytes(buffer, [0x1f, 0x8b])) {
    return "application/gzip";
  }

  // TAR (ustar): "ustar" at offset 257
  if (buffer.length >= 262 && checkString(buffer, "ustar", 257)) {
    return "application/x-tar";
  }

  // ===== FONTS =====

  // WOFF: 77 4F 46 46 (wOFF)
  if (checkString(buffer, "wOFF")) {
    return "font/woff";
  }

  // WOFF2: 77 4F 46 32 (wOF2)
  if (checkString(buffer, "wOF2")) {
    return "font/woff2";
  }

  // TTF: 00 01 00 00 00
  if (checkBytes(buffer, [0x00, 0x01, 0x00, 0x00, 0x00])) {
    return "font/ttf";
  }

  // OTF: 4F 54 54 4F (OTTO)
  if (checkString(buffer, "OTTO")) {
    return "font/otf";
  }

  // ===== TEXT =====

  // JSON (basic check for { or [)
  if (buffer.length >= 1) {
    const firstByte = buffer[0];
    if (firstByte === 0x7b || firstByte === 0x5b) {
      // { or [
      try {
        const text = new TextDecoder("utf-8").decode(
          buffer.slice(0, Math.min(1024, buffer.length)),
        );
        JSON.parse(text.trim());
        return "application/json";
      } catch {
        // Not valid JSON
      }
    }
  }

  // Fallback to extension-based detection
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      // Images
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "gif":
        return "image/gif";
      case "webp":
        return "image/webp";
      case "avif":
        return "image/avif";
      case "heic":
      case "heif":
        return "image/heic";
      case "bmp":
        return "image/bmp";
      case "tiff":
      case "tif":
        return "image/tiff";
      case "ico":
        return "image/x-icon";
      case "svg":
        return "image/svg+xml";

      // Videos
      case "mp4":
      case "m4v":
        return "video/mp4";
      case "webm":
        return "video/webm";
      case "avi":
        return "video/x-msvideo";
      case "mov":
        return "video/quicktime";
      case "mkv":
        return "video/x-matroska";

      // Audio
      case "mp3":
        return "audio/mpeg";
      case "wav":
        return "audio/wav";
      case "flac":
        return "audio/flac";
      case "ogg":
        return "audio/ogg";
      case "m4a":
        return "audio/mp4";

      // Documents
      case "pdf":
        return "application/pdf";
      case "docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      case "xlsx":
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      case "pptx":
        return "application/vnd.openxmlformats-officedocument.presentationml.presentation";

      // Archives
      case "zip":
        return "application/zip";
      case "rar":
        return "application/x-rar-compressed";
      case "7z":
        return "application/x-7z-compressed";
      case "gz":
      case "gzip":
        return "application/gzip";
      case "tar":
        return "application/x-tar";

      // Fonts
      case "woff":
        return "font/woff";
      case "woff2":
        return "font/woff2";
      case "ttf":
        return "font/ttf";
      case "otf":
        return "font/otf";

      // Text
      case "txt":
        return "text/plain";
      case "json":
        return "application/json";
      case "xml":
        return "application/xml";
      case "html":
      case "htm":
        return "text/html";
      case "css":
        return "text/css";
      case "js":
        return "application/javascript";
      case "csv":
        return "text/csv";

      default:
        return "application/octet-stream";
    }
  }

  return "application/octet-stream";
};

/**
 * Compare two MIME types with lenient matching.
 * Matches on major type (e.g., "image/*") to allow for minor variations.
 *
 * @param declared - MIME type provided by client
 * @param detected - MIME type detected from file content
 * @returns true if MIME types are compatible
 *
 * @example
 * compareMimeTypes("image/png", "image/apng") // true
 * compareMimeTypes("image/jpeg", "image/png") // true (both images)
 * compareMimeTypes("image/png", "application/pdf") // false
 */
export function compareMimeTypes(declared: string, detected: string): boolean {
  // Exact match
  if (declared === detected) {
    return true;
  }

  // Extract major types (e.g., "image" from "image/png")
  const declaredMajor = declared.split("/")[0];
  const detectedMajor = detected.split("/")[0];

  // Compare major types for lenient matching
  return declaredMajor === detectedMajor;
}
