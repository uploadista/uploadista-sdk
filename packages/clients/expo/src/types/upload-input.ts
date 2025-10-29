// import type { Blob } from "expo-blob";
/**
 * Expo file input types
 * Can be a Blob, File, URI string, or URI object from Expo APIs
 */
export type ExpoUploadInput = Blob | File | string | { uri: string };
