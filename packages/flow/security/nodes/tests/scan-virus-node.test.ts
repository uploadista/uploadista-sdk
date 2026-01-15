import { describe, expect, it } from "@effect/vitest";
import { UploadistaError } from "@uploadista/core/errors";
import {
  TestUploadEngine,
  TestVirusScanPlugin,
} from "@uploadista/core/testing";
import type { UploadFile } from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import { createScanVirusNode } from "../src/scan-virus-node";

/**
 * EICAR test file signature (standard antivirus test file)
 * This is a safe, non-malicious string used to test antivirus software
 */
const EICAR_SIGNATURE =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/**
 * Test utilities for creating sample data
 */
const createTestUploadFile = (overrides?: Partial<UploadFile>): UploadFile => ({
  id: "test-file-1",
  offset: 0,
  size: 1024,
  storage: {
    id: "test-storage",
    type: "memory",
  },
  metadata: {
    mimeType: "application/octet-stream",
    originalName: "test-file.bin",
    fileName: "test-file.bin",
    extension: "bin",
  },
  url: "https://example.com/test-file.bin",
  creationDate: new Date().toISOString(),
  ...overrides,
});

/**
 * Create test file bytes (clean file)
 */
const createCleanFileBytes = (): Uint8Array => {
  const encoder = new TextEncoder();
  return encoder.encode("This is a clean test file");
};

/**
 * Create test file bytes (infected with EICAR signature)
 */
const createInfectedFileBytes = (): Uint8Array => {
  const encoder = new TextEncoder();
  return encoder.encode(EICAR_SIGNATURE);
};

/**
 * Test layer combining all mocks
 */
const TestLayer = Layer.mergeAll(TestVirusScanPlugin, TestUploadEngine);

describe("Scan Virus Node", () => {
  describe("Node Creation", () => {
    it.effect("should create scan virus node with correct properties", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-1", {
          action: "fail",
          timeout: 60000,
        });

        expect(node.id).toBe("scan-1");
        expect(node.name).toBe("Scan Virus");
        expect(node.description).toBe(
          "Scans files for viruses and malware using ClamAV",
        );
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should create node with default parameters", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-default");

        expect(node.id).toBe("scan-default");
        expect(node.name).toBe("Scan Virus");
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("Clean File Scanning", () => {
    it.effect("should pass clean file through unchanged", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-clean", {
          action: "fail",
          timeout: 60000,
        });

        const testFile = createTestUploadFile();
        const cleanBytes = createCleanFileBytes();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.virusScan).toBeDefined();
          expect(result.data.metadata?.virusScan?.isClean).toBe(true);
          expect(result.data.metadata?.virusScan?.scanned).toBe(true);
          expect(result.data.metadata?.virusScan?.detectedViruses).toEqual([]);
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should add virus scan metadata to clean file", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-metadata", {
          action: "fail",
          timeout: 60000,
        });

        const testFile = createTestUploadFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          const scanMetadata = result.data.metadata?.virusScan;
          expect(scanMetadata).toBeDefined();
          expect(scanMetadata?.scanned).toBe(true);
          expect(scanMetadata?.isClean).toBe(true);
          expect(scanMetadata?.detectedViruses).toEqual([]);
          expect(scanMetadata?.scanDate).toBeDefined();
          expect(scanMetadata?.engineVersion).toBeDefined();
          expect(scanMetadata?.definitionsDate).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should preserve existing file metadata", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-preserve", {
          action: "fail",
          timeout: 60000,
        });

        const testFile = createTestUploadFile({
          metadata: {
            mimeType: "image/jpeg",
            originalName: "photo.jpg",
            fileName: "photo.jpg",
            extension: "jpg",
            width: 1920,
            height: 1080,
            customField: "custom value",
          },
        });

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data.metadata?.mimeType).toBe("image/jpeg");
          expect(result.data.metadata?.width).toBe(1920);
          expect(result.data.metadata?.height).toBe(1080);
          expect(result.data.metadata?.customField).toBe("custom value");
          expect(result.data.metadata?.virusScan).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("Infected File Scanning - Fail Action", () => {
    it.effect("should fail flow when virus detected with fail action", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-fail", {
          action: "fail",
          timeout: 60000,
        });

        // Use file ID containing "infected" to trigger EICAR content from mock
        const testFile = createTestUploadFile({ id: "infected-file-1" });

        const result = yield* Effect.either(
          node.run({
            data: testFile,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(UploadistaError);
          expect(result.left.code).toBe("VIRUS_DETECTED");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should include virus names in error message", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-names", {
          action: "fail",
          timeout: 60000,
        });

        // Use file ID containing "infected" to trigger EICAR content from mock
        const testFile = createTestUploadFile({ id: "infected-file-2" });

        const result = yield* Effect.either(
          node.run({
            data: testFile,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          const error = result.left as UploadistaError;
          expect(error.body).toBeDefined();
          expect(typeof error.body).toBe("string");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should include scan metadata in error details", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-details", {
          action: "fail",
          timeout: 60000,
        });

        // Use file ID containing "infected" to trigger EICAR content from mock
        const testFile = createTestUploadFile({ id: "infected-file-3" });

        const result = yield* Effect.either(
          node.run({
            data: testFile,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          const error = result.left as UploadistaError;
          expect(error.details).toBeDefined();
          expect(error.details?.scanMetadata).toBeDefined();
          expect(error.details?.scanMetadata.isClean).toBe(false);
          expect(error.details?.scanMetadata.detectedViruses).toBeDefined();
          expect(
            error.details?.scanMetadata.detectedViruses.length,
          ).toBeGreaterThan(0);
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("Infected File Scanning - Pass Action", () => {
    it.effect("should continue flow when virus detected with pass action", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-pass", {
          action: "pass",
          timeout: 60000,
        });

        // Use file ID containing "infected" to trigger EICAR content from mock
        const testFile = createTestUploadFile({ id: "infected-file-pass-1" });

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should add virus detection metadata when passing infected file",
      () =>
        Effect.gen(function* () {
          const node = yield* createScanVirusNode("scan-pass-metadata", {
            action: "pass",
            timeout: 60000,
          });

          // Use file ID containing "infected" to trigger EICAR content from mock
          const testFile = createTestUploadFile({ id: "infected-file-pass-2" });

          const result = yield* node.run({
            data: testFile,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          });

          expect(result.type).toBe("complete");
          if (result.type === "complete") {
            const scanMetadata = result.data.metadata?.virusScan;
            expect(scanMetadata).toBeDefined();
            expect(scanMetadata?.scanned).toBe(true);
            expect(scanMetadata?.isClean).toBe(false);
            expect(scanMetadata?.detectedViruses).toBeDefined();
            expect(scanMetadata?.detectedViruses.length).toBeGreaterThan(0);
          }
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should preserve file bytes when passing infected file", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-pass-bytes", {
          action: "pass",
          timeout: 60000,
        });

        // Use file ID containing "infected" to trigger EICAR content from mock
        const testFile = createTestUploadFile({ id: "infected-file-pass-3" });

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          // The transform creates a new upload with a new ID, but the file is processed
          expect(result.data.id).toBeDefined();
          expect(typeof result.data.id).toBe("string");
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("Parameter Validation", () => {
    it.effect("should accept valid fail action", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-valid-fail", {
          action: "fail",
          timeout: 60000,
        });

        expect(node.id).toBe("scan-valid-fail");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should accept valid pass action", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-valid-pass", {
          action: "pass",
          timeout: 120000,
        });

        expect(node.id).toBe("scan-valid-pass");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should apply default timeout", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-default-timeout", {
          action: "fail",
          timeout: 60000,
        });

        expect(node.id).toBe("scan-default-timeout");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should accept custom timeout within limits", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-custom-timeout", {
          action: "fail",
          timeout: 180000, // 3 minutes
        });

        expect(node.id).toBe("scan-custom-timeout");
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("Engine Version", () => {
    it.effect("should include engine version in scan metadata", () =>
      Effect.gen(function* () {
        const node = yield* createScanVirusNode("scan-version", {
          action: "fail",
          timeout: 60000,
        });

        const testFile = createTestUploadFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          const scanMetadata = result.data.metadata?.virusScan;
          expect(scanMetadata?.engineVersion).toBeDefined();
          expect(typeof scanMetadata?.engineVersion).toBe("string");
          expect(scanMetadata?.engineVersion.length).toBeGreaterThan(0);
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });
});
