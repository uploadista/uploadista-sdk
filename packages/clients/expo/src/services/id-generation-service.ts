import type { IdGenerationService } from "@uploadista/client-core";
import * as Crypto from "expo-crypto";

/**
 * Expo-specific implementation of IdGenerationService using uuid library
 * crypto.randomUUID() is not available in Expo/React Native, so we use the uuid library
 */
export function createExpoIdGenerationService(): IdGenerationService {
  return {
    generate(): string {
      return Crypto.randomUUID();
    },
  };
}
