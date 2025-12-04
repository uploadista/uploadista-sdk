/**
 * Basic Observability Example
 *
 * This example demonstrates how to enable OTLP tracing for the Uploadista SDK.
 *
 * Prerequisites:
 * 1. Start a local observability stack:
 *    docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm
 *
 * 2. Set environment variables:
 *    export OTEL_SERVICE_NAME=uploadista-basic-example
 *    export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 *
 * 3. Run this example:
 *    npx tsx examples/observability/basic-example.ts
 *
 * 4. View traces in Grafana:
 *    Open http://localhost:3000, go to Explore, select Tempo, search for service.name="uploadista-basic-example"
 */

import { OtlpNodeSdkLive } from "@uploadista/observability";
import { Effect } from "effect";

// Example effect with spans
const uploadSimulation = Effect.gen(function* () {
  // Simulate file validation
  yield* Effect.log("Validating file...");
  yield* Effect.sleep("100 millis");

  // Simulate upload to storage
  yield* Effect.log("Uploading to storage...");
  yield* Effect.sleep("500 millis");

  // Simulate metadata update
  yield* Effect.log("Updating metadata...");
  yield* Effect.sleep("50 millis");

  return { success: true, fileId: "file-123" };
}).pipe(
  Effect.withSpan("upload-file", {
    attributes: {
      "file.name": "example.pdf",
      "file.size": 1024000,
      "file.type": "application/pdf",
    },
  }),
);

// Create a batch of uploads with nested spans
const batchUpload = Effect.gen(function* () {
  yield* Effect.log("Starting batch upload");

  const results = yield* Effect.all(
    [
      uploadSimulation.pipe(
        Effect.withSpan("batch-item-1", { attributes: { "batch.index": 0 } }),
      ),
      uploadSimulation.pipe(
        Effect.withSpan("batch-item-2", { attributes: { "batch.index": 1 } }),
      ),
      uploadSimulation.pipe(
        Effect.withSpan("batch-item-3", { attributes: { "batch.index": 2 } }),
      ),
    ],
    { concurrency: 2 },
  );

  yield* Effect.log("Batch upload complete");
  return results;
}).pipe(
  Effect.withSpan("batch-upload", {
    attributes: {
      "batch.size": 3,
      "batch.concurrency": 2,
    },
  }),
);

// Main program
const program = Effect.gen(function* () {
  console.log("Starting observability example...");
  console.log("Make sure you have:");
  console.log(
    "1. Docker running: docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm",
  );
  console.log("2. OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318");
  console.log("");

  const result = yield* batchUpload;

  console.log("Results:", result);
  console.log("");
  console.log("View traces at: http://localhost:3000");
  console.log('Go to Explore > Tempo > Search for service.name="uploadista"');

  // Give time for traces to be exported
  yield* Effect.sleep("2 seconds");
});

// Run with OTLP tracing
Effect.runPromise(program.pipe(Effect.provide(OtlpNodeSdkLive))).catch(
  console.error,
);
