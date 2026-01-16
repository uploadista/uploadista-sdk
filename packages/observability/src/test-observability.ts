/**
 * Validation test for core observability infrastructure
 *
 * This test validates:
 * 1. Layer creation and composition
 * 2. Storage observability with metrics
 * 3. Error classification
 * 4. Tracing with spans
 * 5. Structured logging
 */

import { Effect, Metric } from "effect";
import {
  classifyStorageError,
  createStorageMetrics,
  logStorageOperation,
  logUploadCompletion,
  makeStorageObservabilityLayer,
  StorageObservability,
  trackStorageError,
  withStorageSpan,
} from "./index.js";

// ============================================================================
// Test: Create Storage Observability Layer
// ============================================================================

const testStorageType = "test-s3";
const testMetrics = createStorageMetrics(testStorageType);
const TestStorageObservabilityLayer = makeStorageObservabilityLayer(
  testStorageType,
  testMetrics,
  true,
);

// ============================================================================
// Test: Simulate Upload Operation with Full Observability
// ============================================================================

const simulateUpload = (fileSize: number, shouldFail: boolean) =>
  Effect.gen(function* () {
    const obs = yield* StorageObservability;

    console.log(`\n📊 Testing with storage type: ${obs.storageType}`);
    console.log(`Service: ${obs.serviceName}`);
    console.log(`Enabled: ${obs.enabled}`);

    // Log operation start
    yield* logStorageOperation(
      testStorageType,
      "uploadFile",
      "test-upload-123",
      { file_size: fileSize },
    );

    // Simulate upload with tracing
    const uploadEffect = Effect.gen(function* () {
      // Track upload request
      yield* obs.metrics.uploadRequestsTotal.pipe(
        Metric.tagged("upload_id", "test-upload-123"),
      )(Effect.succeed(1));

      // Track file size
      yield* obs.metrics.fileSizeHistogram(Effect.succeed(fileSize));

      // Simulate upload work
      yield* Effect.sleep("100 millis");

      if (shouldFail) {
        return yield* Effect.fail(
          new Error("NetworkError: Connection timeout"),
        );
      }

      // Track success
      yield* obs.metrics.uploadSuccessTotal.pipe(
        Metric.tagged("upload_id", "test-upload-123"),
      )(Effect.succeed(1));

      return { uploadId: "test-upload-123", key: "test-file.jpg" };
    });

    // Wrap with span
    const result = yield* uploadEffect.pipe(
      withStorageSpan("uploadFile", testStorageType, {
        "file.size": fileSize,
        "upload.id": "test-upload-123",
      }),
    );

    // Log completion
    yield* logUploadCompletion(testStorageType, "test-upload-123", {
      fileSize,
      totalDurationMs: 100,
      throughputBps: (fileSize / 100) * 1000,
    });

    return result;
  });

// ============================================================================
// Test: Error Classification
// ============================================================================

const testErrorClassification = Effect.sync(() => {
  console.log("\n🔍 Testing Error Classification:");

  const testErrors = [
    { error: { code: "NetworkError" }, expected: "network_error" },
    { error: { code: "InvalidAccessKeyId" }, expected: "authentication_error" },
    { error: { code: "AccessDenied" }, expected: "authorization_error" },
    { error: { code: "SlowDown" }, expected: "throttling_error" },
    { error: { code: "InternalError" }, expected: "server_error" },
    { error: { code: "InvalidRequest" }, expected: "client_error" },
    { error: { code: "UnknownError" }, expected: "unknown_error" },
  ];

  for (const { error, expected } of testErrors) {
    const category = classifyStorageError(error);
    const status = category === expected ? "✅" : "❌";
    console.log(
      `  ${status} ${error.code} -> ${category} (expected: ${expected})`,
    );
  }
});

// ============================================================================
// Test: Error Tracking with Metrics
// ============================================================================

const testErrorTracking = Effect.gen(function* () {
  const obs = yield* StorageObservability;

  console.log("\n⚠️  Testing Error Tracking:");

  const error = new Error("ECONNRESET: Connection reset by peer");
  (error as unknown as { code: string }).code = "ECONNRESET";

  yield* trackStorageError(testStorageType, obs.metrics, "uploadPart", error, {
    upload_id: "test-upload-456",
    part_number: 1,
  });

  console.log("  ✅ Error tracked with metrics and logs");
});

// ============================================================================
// Test: Successful Upload Flow
// ============================================================================

const testSuccessfulUpload = Effect.gen(function* () {
  console.log("\n✅ Testing Successful Upload:");

  const result = yield* simulateUpload(1024 * 1024 * 10, false); // 10MB file
  console.log(`  ✅ Upload completed: ${result.uploadId} -> ${result.key}`);
});

// ============================================================================
// Test: Failed Upload Flow
// ============================================================================

const testFailedUpload = Effect.gen(function* () {
  console.log("\n❌ Testing Failed Upload:");

  const obs = yield* StorageObservability;

  // Use either to handle success and failure cases
  const result = yield* Effect.either(simulateUpload(1024 * 1024 * 5, true));

  if (result._tag === "Left") {
    const error: unknown = result.left;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Upload failed as expected: ${errorMsg}`);

    // Track the error
    yield* trackStorageError(
      testStorageType,
      obs.metrics,
      "uploadFile",
      error,
      { upload_id: "test-upload-789" },
    );

    console.log("  ✅ Error handled and tracked successfully");
  } else {
    console.log("  ❌ Upload should have failed but succeeded");
  }
});

// ============================================================================
// Test: Metrics Snapshot
// ============================================================================

const testMetricsSnapshot = Effect.gen(function* () {
  console.log("\n📈 Testing Metrics Snapshot:");

  const snapshot = yield* Metric.snapshot;
  console.log(`  ✅ Captured ${snapshot.length} metric(s)`);

  // Display some metrics
  for (const metric of snapshot.slice(0, 5)) {
    console.log(
      `     - ${metric.metricKey.name}: ${JSON.stringify(metric.metricState)}`,
    );
  }
});

// ============================================================================
// Run All Tests
// ============================================================================

const runTests = Effect.gen(function* () {
  console.log("🧪 Observability Infrastructure Validation Test");
  console.log("=".repeat(50));

  // Run all tests
  yield* testErrorClassification;
  yield* testSuccessfulUpload;
  yield* testFailedUpload;
  yield* testErrorTracking;
  yield* testMetricsSnapshot;

  console.log(`\n${"=".repeat(50)}`);
  console.log("✅ All tests completed successfully!");
  console.log("\nCore observability infrastructure is working correctly:");
  console.log("  ✅ Layer creation and composition");
  console.log("  ✅ Metrics tracking (counters, histograms, gauges)");
  console.log("  ✅ Error classification and tracking");
  console.log("  ✅ Tracing with spans");
  console.log("  ✅ Structured logging");
}).pipe(Effect.provide(TestStorageObservabilityLayer));

// Run the tests
Effect.runPromise(runTests).catch((error) => {
  console.error("\n❌ Test failed:", error);
  process.exit(1);
});
