import type { IdGenerationService } from "@uploadista/client-core";
import { v4 as uuidv4 } from "uuid";

/**
 * React Native-specific implementation of IdGenerationService using uuid library
 * crypto.randomUUID() is not available in React Native, so we use the uuid library
 */
export function createReactNativeIdGenerationService(): IdGenerationService {
  return {
    generate(): string {
      return uuidv4();
    },
  };
}
