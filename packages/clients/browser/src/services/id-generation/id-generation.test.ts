import { describe, expect, it } from "vitest";
import { createBrowserIdGenerationService } from "./id-generation";

describe("createBrowserIdGenerationService", () => {
  it("should create an ID generation service", () => {
    const service = createBrowserIdGenerationService();
    expect(service).toBeDefined();
    expect(service.generate).toBeDefined();
    expect(typeof service.generate).toBe("function");
  });

  describe("generate", () => {
    it("should generate a UUID v4 string", () => {
      const service = createBrowserIdGenerationService();
      const id = service.generate();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("should generate unique IDs", () => {
      const service = createBrowserIdGenerationService();
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        ids.add(service.generate());
      }

      // All 100 IDs should be unique
      expect(ids.size).toBe(100);
    });

    it("should have correct UUID v4 version byte", () => {
      const service = createBrowserIdGenerationService();
      const id = service.generate();

      // The 13th character (index 14 after hyphens) should be '4' for v4
      const parts = id.split("-");
      expect(parts[2][0]).toBe("4");
    });

    it("should have correct UUID v4 variant byte", () => {
      const service = createBrowserIdGenerationService();
      const id = service.generate();

      // The variant byte should be 8, 9, a, or b
      const parts = id.split("-");
      const variantChar = parts[3][0].toLowerCase();
      expect(["8", "9", "a", "b"]).toContain(variantChar);
    });
  });
});
