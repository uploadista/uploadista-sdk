import type { IdGenerationService } from "@uploadista/client-core";
import { v4 as uuidv4 } from "uuid";

/**
 * Expo-specific implementation of IdGenerationService using uuid library
 * crypto.randomUUID() is not available in Expo/React Native, so we use the uuid library
 */
export function createExpoIdGenerationService(): IdGenerationService {
  return {
    generate(): string {
      return uuidv4();
    },
  };
}
