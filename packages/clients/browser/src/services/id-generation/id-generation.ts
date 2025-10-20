import type { IdGenerationService } from "@uploadista/client-core";

/**
 * Browser-specific implementation of IdGenerationService using crypto.randomUUID()
 */
export function createBrowserIdGenerationService(): IdGenerationService {
  return {
    generate: () => crypto.randomUUID(),
  };
}
