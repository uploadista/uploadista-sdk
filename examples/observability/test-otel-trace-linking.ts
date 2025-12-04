/**
 * Pure OpenTelemetry Trace Linking Test
 *
 * This test verifies that trace context can be captured and restored
 * using pure OpenTelemetry APIs (without Effect).
 *
 * Run with:
 *   OTEL_SERVICE_NAME=test-otel-linking \
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
 *   pnpm --filter=@uploadista/observability exec tsx ../../examples/observability/test-otel-trace-linking.ts
 *
 * View traces at http://localhost:3000 (Grafana) > Explore > Tempo
 */

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  context as otelContext,
  trace,
  SpanKind,
  SpanStatusCode,
  type Span,
  type SpanContext,
} from "@opentelemetry/api";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// Type for stored trace context (matching UploadFile.traceContext)
type StoredTraceContext = {
  traceId: string;
  spanId: string;
  traceFlags: number;
};

// Initialize OpenTelemetry
const serviceName = process.env.OTEL_SERVICE_NAME ?? "test-otel-linking";
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

console.log("Setting up OpenTelemetry...");
console.log(`  Service: ${serviceName}`);
console.log(`  Endpoint: ${otlpEndpoint}`);

const exporter = new OTLPTraceExporter({
  url: `${otlpEndpoint}/v1/traces`,
});

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
});

const provider = new BasicTracerProvider({ resource });
provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();

const tracer = trace.getTracer("test-tracer");

// Helper to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Capture trace context from current span (like in create-upload.ts)
function captureTraceContext(): StoredTraceContext | undefined {
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

// Restore span context from stored trace context
function createSpanContext(stored: StoredTraceContext): SpanContext {
  return {
    traceId: stored.traceId,
    spanId: stored.spanId,
    traceFlags: stored.traceFlags,
    isRemote: true,
  };
}

// Run work within a span
async function withSpan<T>(
  name: string,
  options: { parent?: StoredTraceContext },
  work: (span: Span) => Promise<T>,
): Promise<T> {
  // If we have a parent context, create a span linked to it
  let activeContext = otelContext.active();

  if (options.parent) {
    const parentSpanContext = createSpanContext(options.parent);
    const parentContext = trace.setSpanContext(otelContext.active(), parentSpanContext);
    activeContext = parentContext;
    console.log(`   Using parent context: traceId=${options.parent.traceId}, spanId=${options.parent.spanId}`);
  }

  // Start span with parent context
  const span = tracer.startSpan(name, { kind: SpanKind.INTERNAL }, activeContext);

  try {
    // Execute work within the span's context
    const result = await otelContext.with(trace.setSpan(activeContext, span), async () => {
      return await work(span);
    });
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
    throw error;
  } finally {
    span.end();
  }
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing Pure OpenTelemetry Trace Linking");
  console.log("=".repeat(60));

  // Step 1: Create parent span and capture its context
  console.log("\n📍 Step 1: Running parent-operation...");

  const storedContext = await withSpan("parent-operation", {}, async (span) => {
    console.log("\n🔵 Inside parent-operation span...");
    span.setAttribute("operation.type", "parent");

    // Capture trace context while inside the span
    const ctx = captureTraceContext();

    await sleep(50);
    return ctx;
  });

  // Step 2: Simulate time passing (like client uploading chunks)
  console.log("\n📍 Step 2: Simulating delay between operations...");
  await sleep(100);

  // Step 3: Create child spans using stored context
  console.log("\n📍 Step 3: Running child operations with restored context...");

  // Child 1
  console.log("\n🟢 Creating child-operation-1...");
  await withSpan("child-operation-1", { parent: storedContext }, async (span) => {
    console.log("   Inside child-operation-1 span...");
    span.setAttribute("operation.type", "child");
    span.setAttribute("child.index", 1);

    // Verify trace ID matches
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      const ctx = currentSpan.spanContext();
      console.log(`   Current traceId: ${ctx.traceId}`);
      console.log(`   Current spanId:  ${ctx.spanId}`);

      if (storedContext && ctx.traceId === storedContext.traceId) {
        console.log("   ✅ Trace IDs MATCH - spans are linked!");
      } else if (storedContext) {
        console.log("   ❌ Trace IDs DO NOT MATCH - spans are NOT linked!");
      }
    }

    await sleep(50);
    return "child-1-done";
  });

  // Child 2
  console.log("\n🟢 Creating child-operation-2...");
  await withSpan("child-operation-2", { parent: storedContext }, async (span) => {
    console.log("   Inside child-operation-2 span...");
    span.setAttribute("operation.type", "child");
    span.setAttribute("child.index", 2);

    // Verify trace ID matches
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      const ctx = currentSpan.spanContext();
      console.log(`   Current traceId: ${ctx.traceId}`);
      console.log(`   Current spanId:  ${ctx.spanId}`);

      if (storedContext && ctx.traceId === storedContext.traceId) {
        console.log("   ✅ Trace IDs MATCH - spans are linked!");
      } else if (storedContext) {
        console.log("   ❌ Trace IDs DO NOT MATCH - spans are NOT linked!");
      }
    }

    await sleep(50);
    return "child-2-done";
  });

  console.log("\n" + "=".repeat(60));
  console.log("Test Complete!");
  console.log("=".repeat(60));
  console.log("\n📊 Check Grafana at http://localhost:3000");
  console.log("   Go to: Explore > Tempo > Search for service.name='" + serviceName + "'");
  console.log("\nExpected trace hierarchy:");
  console.log("   - parent-operation (root)");
  console.log("     - child-operation-1");
  console.log("     - child-operation-2");
  console.log("\n⚠️  If you see 3 separate traces, trace linking is BROKEN.");

  // Wait for traces to be exported
  console.log("\n⏳ Waiting 3 seconds for traces to be exported...");
  await sleep(3000);

  // Shutdown provider to flush traces
  await provider.shutdown();
  console.log("✅ Done! Traces should now be visible in Grafana.");
}

main().catch(console.error);
