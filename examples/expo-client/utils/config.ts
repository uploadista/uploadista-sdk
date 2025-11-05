/**
 * Configuration for the Expo example app
 */

// API server URL - update this to your server
// For local development with Expo Go, use your machine's IP address
// Example: http://192.168.1.100:3000
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.1:3000";

// Log API configuration on startup
console.log("=== Uploadista Expo Client Configuration ===");
console.log("API_URL:", API_URL);
console.log("EXPO_PUBLIC_API_URL env var:", process.env.EXPO_PUBLIC_API_URL);
console.log("==========================================");

// Flow configuration
export const FLOW_CONFIG = {
  // Example flow ID - update this based on your server
  flowId: "example-flow",
  timeout: 30000, // 30 seconds
};

// Upload configuration
export const UPLOAD_CONFIG = {
  chunkSize: 1024 * 1024, // 1MB chunks
  maxRetries: 3,
  timeout: 30000,
};

// File picker defaults
export const FILE_PICKER_CONFIG = {
  // Limit file size to 50MB for mobile
  maxFileSize: 50 * 1024 * 1024,
  // Allowed MIME types (empty = all)
  mimeTypes: [],
};
