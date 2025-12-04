/**
 * Test Trace Linking
 *
 * This script tests whether trace context is properly captured and restored
 * for distributed tracing scenarios.
 *
 * Prerequisites:
 * 1. Start local Grafana LGTM stack:
 *    docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm
 *
 * 2. Run this test:
 *    OTEL_SERVICE_NAME=test-trace-linking \
 *    OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
 *    npx tsx examples/observability/test-trace-linking.ts
 *
 * 3. View traces at http://localhost:3000 (Grafana)
 *    - Go to Explore > Tempo > Search for service.name="test-trace-linking"
 *
 * Expected: All spans should be grouped under one trace with parent-child relationships:
 *   - parent-operation (root)
 *     - child-operation-1
 *     - child-operation-2
 *
 * If you see 3 separate traces, the trace linking is broken.
 */

import { trace } from "@opentelemetry/api";
import { OtlpNodeSdkLive } from "@uploadista/observability";
import { Duration, Effect, Tracer } from "effect";

// Type matching what's stored in UploadFile
type TraceContext = {
  traceId: string;
  spanId: string;
  traceFlags: number;
};

// Simulates capturing trace context (like in create-upload.ts)
function captureTraceContext(): TraceContext | undefined {
  const currentSpan = trace.getActiveSpan();
  if (!currentSpan) {
    console.log("  ❌ No active span found during capture");
    return undefined;
  }
  const spanContext = currentSpan.spanContext();
  console.log("  ✅ Captured trace context:");
  console.log(`     traceId: ${spanContext.traceId}`);
  console.log(`     spanId:  ${spanContext.spanId}`);
  console.log(`     flags:   ${spanContext.traceFlags}`);
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  };
}

// Simulates creating an external span (like in upload-chunk.ts)
function createExternalSpan(traceContext: TraceContext) {
  return Tracer.externalSpan({
    traceId: traceContext.traceId,
    spanId: traceContext.spanId,
    sampled: traceContext.traceFlags === 1,
  });
}

// Helper sleep function compatible with different Effect versions
const sleep = (ms: number) => Effect.promise(() => new Promise(resolve => setTimeout(resolve, ms)));

// Simulate parent operation (like upload-create)
const parentOperation = Effect.gen(function* () {
  console.log("\n🔵 Inside parent-operation span...");

  // Capture trace context while inside the span
  const traceContext = captureTraceContext();

  yield* sleep(50);

  // Return the captured context (simulating storing in KV)
  return traceContext;
}).pipe(
  Effect.withSpan("parent-operation", {
    attributes: { "operation.type": "parent" },
  }),
);

// Simulate child operation that restores context (like upload-chunk)
const childOperation = (
  storedContext: TraceContext | undefined,
  childIndex: number,
) => {
  // Create external span from stored context
  const parentSpan = storedContext
    ? createExternalSpan(storedContext)
    : undefined;

  console.log(`\n🟢 Creating child-operation-${childIndex}...`);
  if (parentSpan) {
    console.log(`   Parent traceId: ${storedContext?.traceId}`);
    console.log(`   Parent spanId:  ${storedContext?.spanId}`);
  } else {
    console.log("   ⚠️  No parent span available!");
  }

  return Effect.gen(function* () {
    console.log(`   Inside child-operation-${childIndex} span...`);

    // Check what the active span is now
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      const ctx = currentSpan.spanContext();
      console.log(`   Current traceId: ${ctx.traceId}`);
      console.log(`   Current spanId:  ${ctx.spanId}`);

      // Verify trace IDs match
      if (storedContext && ctx.traceId === storedContext.traceId) {
        console.log(`   ✅ Trace IDs MATCH - spans are linked!`);
      } else if (storedContext) {
        console.log(`   ❌ Trace IDs DO NOT MATCH - spans are NOT linked!`);
      }
    }

    yield* sleep(50);
    return `child-${childIndex}-done`;
  }).pipe(
    Effect.withSpan(`child-operation-${childIndex}`, {
      attributes: { "operation.type": "child", "child.index": childIndex },
      parent: parentSpan, // <-- This is the key: pass parent directly
    }),
  );
};

// Main test program
const program = Effect.gen(function* () {
  console.log("=".repeat(60));
  console.log("Testing Trace Context Linking");
  console.log("=".repeat(60));

  // Step 1: Run parent operation and capture context
  console.log("\n📍 Step 1: Running parent operation...");
  const storedContext = yield* parentOperation;

  // Step 2: Simulate time passing (like client uploading chunks)
  console.log("\n📍 Step 2: Simulating delay between operations...");
  yield* sleep(100);

  // Step 3: Run child operations with restored context
  console.log("\n📍 Step 3: Running child operations with restored context...");

  // Run child operations sequentially to make it easier to debug
  const result1 = yield* childOperation(storedContext, 1);
  const result2 = yield* childOperation(storedContext, 2);

  console.log("\n" + "=".repeat(60));
  console.log("Test Complete!");
  console.log("=".repeat(60));
  console.log("\nResults:", { result1, result2 });
  console.log("\n📊 Check Grafana at http://localhost:3000");
  console.log("   Go to: Explore > Tempo > Search for service.name='test-trace-linking'");
  console.log("\nExpected trace hierarchy:");
  console.log("   - parent-operation (root)");
  console.log("     - child-operation-1");
  console.log("     - child-operation-2");
  console.log("\n⚠️  If you see 3 separate traces, trace linking is BROKEN.");

  // Wait for traces to be exported
  console.log("\n⏳ Waiting 3 seconds for traces to be exported...");
  yield* sleep(3000);
  console.log("✅ Done!");
});

// Run with OTLP tracing
Effect.runPromise(program.pipe(Effect.provide(OtlpNodeSdkLive))).catch(
  console.error,
);
