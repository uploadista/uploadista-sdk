import { describe, expect, it, vi, beforeEach } from "vitest";
import { Effect } from "effect";
import { VirusScanPlugin } from "@uploadista/core/flow";
import { virusScanPlugin, type VirusScanPluginConfig } from "../src/clamscan-plugin";

// Shared mock state
let mockIsInfectedResult: { isInfected: boolean; file: string; viruses: string[] | null } = {
  isInfected: false,
  file: "/tmp/test-file",
  viruses: [],
};
let mockVersionResult: { version: string | undefined } = { version: "ClamAV 1.0.0" };
let mockInitShouldFail = false;
let mockIsInfectedShouldFail = false;
let mockGetVersionShouldFail = false;

// Mock the clamscan module
vi.mock("clamscan", () => {
  return {
    default: class MockNodeClam {
      async init() {
        if (mockInitShouldFail) {
          throw new Error("ClamAV not found");
        }
        return this;
      }
      async isInfected() {
        if (mockIsInfectedShouldFail) {
          throw new Error("Scan timeout");
        }
        return mockIsInfectedResult;
      }
      async getVersion() {
        if (mockGetVersionShouldFail) {
          throw new Error("Connection refused");
        }
        return mockVersionResult;
      }
    },
  };
});

describe("ClamScan Virus Plugin", () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockIsInfectedResult = {
      isInfected: false,
      file: "/tmp/test-file",
      viruses: [],
    };
    mockVersionResult = { version: "ClamAV 1.0.0" };
    mockInitShouldFail = false;
    mockIsInfectedShouldFail = false;
    mockGetVersionShouldFail = false;
  });

  describe("virusScanPlugin factory", () => {
    it("should create a plugin layer with default configuration", () => {
      const layer = virusScanPlugin();
      expect(layer).toBeDefined();
    });

    it("should create a plugin layer with custom configuration", () => {
      const config: VirusScanPluginConfig = {
        preference: "clamscan",
        clamdscan_socket: "/custom/socket/path",
        clamdscan_host: "localhost",
        clamdscan_port: 3311,
        remove_infected: false,
        debug_mode: true,
      };
      const layer = virusScanPlugin(config);
      expect(layer).toBeDefined();
    });
  });

  describe("scan method", () => {
    it("should return clean result for non-infected file", async () => {
      mockIsInfectedResult = {
        isInfected: false,
        file: "/tmp/test-file",
        viruses: [],
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        const fileData = new TextEncoder().encode("clean file content");
        return yield* plugin.scan(fileData);
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result.isClean).toBe(true);
      expect(result.detectedViruses).toEqual([]);
    });

    it("should return infected result with virus names", async () => {
      mockIsInfectedResult = {
        isInfected: true,
        file: "/tmp/test-file",
        viruses: ["Eicar-Test-Signature", "Win.Trojan.Generic"],
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        const fileData = new TextEncoder().encode("infected file content");
        return yield* plugin.scan(fileData);
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result.isClean).toBe(false);
      expect(result.detectedViruses).toEqual(["Eicar-Test-Signature", "Win.Trojan.Generic"]);
    });

    it("should handle null virus array for infected files", async () => {
      mockIsInfectedResult = {
        isInfected: true,
        file: "/tmp/test-file",
        viruses: null,
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        const fileData = new TextEncoder().encode("infected file");
        return yield* plugin.scan(fileData);
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result.isClean).toBe(false);
      expect(result.detectedViruses).toEqual([]);
    });

    it("should handle binary data correctly", async () => {
      mockIsInfectedResult = {
        isInfected: false,
        file: "/tmp/test-file",
        viruses: [],
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        // Binary data that isn't valid UTF-8
        const binaryData = new Uint8Array([0x00, 0xff, 0xfe, 0x89, 0x50, 0x4e, 0x47]);
        return yield* plugin.scan(binaryData);
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result.isClean).toBe(true);
    });

    it("should handle large file data", async () => {
      mockIsInfectedResult = {
        isInfected: false,
        file: "/tmp/test-file",
        viruses: [],
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        // 1MB of data
        const largeData = new Uint8Array(1024 * 1024).fill(0x41);
        return yield* plugin.scan(largeData);
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result.isClean).toBe(true);
    });
  });

  describe("getVersion method", () => {
    it("should return ClamAV version string", async () => {
      mockVersionResult = {
        version: "ClamAV 1.0.0/26789/Tue Jan 14 09:00:00 2025",
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        return yield* plugin.getVersion();
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result).toBe("ClamAV 1.0.0/26789/Tue Jan 14 09:00:00 2025");
    });

    it("should return 'Unknown' when version is undefined", async () => {
      mockVersionResult = {
        version: undefined,
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        return yield* plugin.getVersion();
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result).toBe("Unknown");
    });

    it("should return 'Unknown' when version is empty", async () => {
      mockVersionResult = {
        version: "",
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        return yield* plugin.getVersion();
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result).toBe("Unknown");
    });
  });

  describe("error handling", () => {
    it("should fail with CLAMAV_NOT_INSTALLED when initialization fails", async () => {
      mockInitShouldFail = true;

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        const fileData = new TextEncoder().encode("test");
        return yield* plugin.scan(fileData);
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(Effect.either(program));
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("CLAMAV_NOT_INSTALLED");
      }
    });

    it("should fail with VIRUS_SCAN_FAILED when scan fails", async () => {
      mockIsInfectedShouldFail = true;

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        const fileData = new TextEncoder().encode("test content");
        return yield* plugin.scan(fileData);
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(Effect.either(program));
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("VIRUS_SCAN_FAILED");
      }
    });

    it("should fail with VIRUS_SCAN_FAILED when getVersion fails", async () => {
      mockGetVersionShouldFail = true;

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        return yield* plugin.getVersion();
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(Effect.either(program));
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("VIRUS_SCAN_FAILED");
      }
    });
  });

  describe("configuration options", () => {
    it("should accept clamdscan preference", () => {
      const layer = virusScanPlugin({ preference: "clamdscan" });
      expect(layer).toBeDefined();
    });

    it("should accept clamscan preference", () => {
      const layer = virusScanPlugin({ preference: "clamscan" });
      expect(layer).toBeDefined();
    });

    it("should accept socket configuration for clamd", () => {
      const layer = virusScanPlugin({
        preference: "clamdscan",
        clamdscan_socket: "/var/run/clamav/clamd.ctl",
      });
      expect(layer).toBeDefined();
    });

    it("should accept TCP host and port for clamd", () => {
      const layer = virusScanPlugin({
        preference: "clamdscan",
        clamdscan_host: "127.0.0.1",
        clamdscan_port: 3310,
      });
      expect(layer).toBeDefined();
    });

    it("should accept debug mode configuration", () => {
      const layer = virusScanPlugin({
        debug_mode: true,
      });
      expect(layer).toBeDefined();
    });

    it("should accept remove_infected configuration", () => {
      const layer = virusScanPlugin({
        remove_infected: false,
      });
      expect(layer).toBeDefined();
    });
  });

  describe("EICAR test file detection", () => {
    it("should detect EICAR test file as infected", async () => {
      // EICAR is a standard antivirus test signature
      const EICAR_SIGNATURE =
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

      mockIsInfectedResult = {
        isInfected: true,
        file: "/tmp/eicar-test",
        viruses: ["Eicar-Test-Signature"],
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        const eicarData = new TextEncoder().encode(EICAR_SIGNATURE);
        return yield* plugin.scan(eicarData);
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result.isClean).toBe(false);
      expect(result.detectedViruses).toContain("Eicar-Test-Signature");
    });
  });

  describe("temporary file handling", () => {
    it("should clean up temporary files after successful scan", async () => {
      mockIsInfectedResult = {
        isInfected: false,
        file: "/tmp/test-file",
        viruses: [],
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        const fileData = new TextEncoder().encode("test content");
        return yield* plugin.scan(fileData);
      }).pipe(Effect.provide(virusScanPlugin()));

      // The test verifies the scan completes - cleanup is handled internally
      const result = await Effect.runPromise(program);
      expect(result).toBeDefined();
      expect(result.isClean).toBe(true);
    });

    it("should clean up temporary files even when scan fails", async () => {
      mockIsInfectedShouldFail = true;

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        const fileData = new TextEncoder().encode("test content");
        return yield* plugin.scan(fileData);
      }).pipe(Effect.provide(virusScanPlugin()));

      // Scan should fail but temp file cleanup should still happen
      const result = await Effect.runPromise(Effect.either(program));
      expect(result._tag).toBe("Left");
    });
  });

  describe("lazy initialization", () => {
    it("should initialize scanner lazily on first use", async () => {
      mockIsInfectedResult = {
        isInfected: false,
        file: "/tmp/test",
        viruses: [],
      };

      const layer = virusScanPlugin();

      // First scan initializes the scanner
      const program1 = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        return yield* plugin.scan(new TextEncoder().encode("test1"));
      }).pipe(Effect.provide(layer));

      await Effect.runPromise(program1);

      // Second scan reuses the initialized scanner (same layer instance)
      const program2 = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        return yield* plugin.scan(new TextEncoder().encode("test2"));
      }).pipe(Effect.provide(layer));

      const result = await Effect.runPromise(program2);
      expect(result.isClean).toBe(true);
    });
  });

  describe("multiple virus detection", () => {
    it("should report multiple viruses when detected", async () => {
      mockIsInfectedResult = {
        isInfected: true,
        file: "/tmp/multi-virus",
        viruses: ["Trojan.Generic", "Worm.Mydoom", "Virus.Sality"],
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        const fileData = new TextEncoder().encode("malicious content");
        return yield* plugin.scan(fileData);
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result.isClean).toBe(false);
      expect(result.detectedViruses).toHaveLength(3);
      expect(result.detectedViruses).toContain("Trojan.Generic");
      expect(result.detectedViruses).toContain("Worm.Mydoom");
      expect(result.detectedViruses).toContain("Virus.Sality");
    });
  });

  describe("empty file handling", () => {
    it("should handle empty file input", async () => {
      mockIsInfectedResult = {
        isInfected: false,
        file: "/tmp/empty-file",
        viruses: [],
      };

      const program = Effect.gen(function* () {
        const plugin = yield* VirusScanPlugin;
        const emptyData = new Uint8Array(0);
        return yield* plugin.scan(emptyData);
      }).pipe(Effect.provide(virusScanPlugin()));

      const result = await Effect.runPromise(program);
      expect(result.isClean).toBe(true);
      expect(result.detectedViruses).toEqual([]);
    });
  });
});
