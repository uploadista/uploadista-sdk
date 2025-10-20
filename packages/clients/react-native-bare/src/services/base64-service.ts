import type { Base64Service } from "@uploadista/client-core";
import { fromBase64 as decode, toBase64 as encode } from "js-base64";

/**
 * React Native-specific implementation of Base64Service using js-base64 library
 * React Native doesn't have native btoa/atob functions, so we use js-base64
 */
export function createReactNativeBase64Service(): Base64Service {
  return {
    toBase64(data: ArrayBuffer): string {
      // Convert ArrayBuffer to Uint8Array
      const uint8Array = new Uint8Array(data);
      // Convert Uint8Array to string
      const binary = Array.from(uint8Array)
        .map((byte) => String.fromCharCode(byte))
        .join("");
      return encode(binary);
    },

    fromBase64(data: string): ArrayBuffer {
      const binary = decode(data);
      const uint8Array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        uint8Array[i] = binary.charCodeAt(i);
      }
      return uint8Array.buffer;
    },
  };
}
