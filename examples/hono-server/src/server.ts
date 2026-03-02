/**
 * Hono Server Example with Observability
 *
 * This example demonstrates running Uploadista with full distributed tracing.
 *
 * Prerequisites for local tracing:
 * 1. Start local Grafana LGTM stack:
 *    docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm
 *
 * 2. Set environment variables:
 *    export OTEL_SERVICE_NAME=uploadista-hono-example
 *    export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 *
 * 3. Run the server:
 *    pnpm dev
 *
 * 4. View traces at http://localhost:3000 (Grafana)
 *    - Go to Explore > Tempo > Search for service.name="uploadista-hono-example"
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { createClient } from "@redis/client";
import { honoAdapter } from "@uploadista/adapters-hono";
import { s3Store } from "@uploadista/data-store-s3";
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { documentPlugin } from "@uploadista/flow-documents-plugin";
import { documentAiPlugin } from "@uploadista/flow-documents-replicate";
import { imageAiPlugin } from "@uploadista/flow-images-replicate";
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { virusScanPlugin } from "@uploadista/flow-security-clamscan";
import { zipPlugin } from "@uploadista/flow-utility-zipjs";
import { videoPlugin } from "@uploadista/flow-videos-av-node";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { OtlpNodeSdkLive } from "@uploadista/observability";
import { createUploadistaServer } from "@uploadista/server";
import dotenv from "dotenv";
import { Hono, type Env } from "hono";
import { cors } from "hono/cors";
import { pinoLogger } from "hono-pino";
import { flows } from "./flows";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = new Hono<Env>();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Create Redis client for KV store
const redisClient = createClient({
  url: process.env.REDIS_URL,
});

await redisClient.connect();
console.log("Redis client connected for KV store");

// Create separate Redis client for pub/sub subscriber (Redis requires dedicated connection)
const redisSubscriberClient = createClient({
  url: process.env.REDIS_URL,
});

await redisSubscriberClient.connect();
console.log("Redis subscriber client connected for event broadcasting");

const kvStore = redisKvStore({
  redis: redisClient,
});

const eventBroadcaster = redisEventBroadcaster({
  redis: redisClient,
  subscriberRedis: redisSubscriberClient,
});

if (!process.env.R2_DELIVERY_URL) {
  throw new Error("R2_DELIVERY_URL is not set");
}
if (!process.env.R2_BUCKET) {
  throw new Error("R2_BUCKET is not set");
}
if (!process.env.R2_ACCESS_KEY_ID) {
  throw new Error("R2_ACCESS_KEY_ID is not set");
}
if (!process.env.R2_SECRET_ACCESS_KEY) {
  throw new Error("R2_SECRET_ACCESS_KEY is not set");
}
if (!process.env.R2_ENDPOINT) {
  throw new Error("R2_ENDPOINT is not set");
}

const dataStore = s3Store({
  deliveryUrl: process.env.R2_DELIVERY_URL,
  s3ClientConfig: {
    bucket: process.env.R2_BUCKET,
    region: "auto",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    endpoint: process.env.R2_ENDPOINT,
  },
});

if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error("REPLICATE_API_TOKEN is not set");
}

// Check if observability is enabled via environment
const isObservabilityEnabled = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
if (isObservabilityEnabled) {
  console.log(
    "🔍 Observability enabled - traces will be exported to:",
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  );
  console.log(
    "   Service name:",
    process.env.OTEL_SERVICE_NAME ?? "uploadista",
  );
} else {
  console.log(
    "ℹ️  Observability disabled. Set OTEL_EXPORTER_OTLP_ENDPOINT to enable.",
  );
}

const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  plugins: [
    imagePlugin(),
    imageAiPlugin(process.env.REPLICATE_API_TOKEN),
    zipPlugin(),
    videoPlugin(),
    virusScanPlugin(),
    documentPlugin(),
    documentAiPlugin(process.env.REPLICATE_API_TOKEN),
  ],
  kvStore,
  eventBroadcaster,
  adapter: honoAdapter(),
  // Enable tracing if OTLP endpoint is configured
  withTracing: isObservabilityEnabled,
  observabilityLayer: OtlpNodeSdkLive,
  // Capture failed jobs for inspection and retry
  deadLetterQueue: true,
  // Queue backed by the same Redis kvStore — no extra client needed.
  // Limits concurrent flows and auto-retries DLQ items every 30s.
  flowQueue: {
    config: { maxConcurrency: 4, dlqRetryIntervalMs: 30_000 },
  },
});

app.use(
  pinoLogger({
    pino: { level: "debug" },
  }),
);

app.use("*", async (c, next) => {
  return cors({
    origin: [...(process.env.ALLOWED_ORIGINS?.split(",") ?? ["*"])],

    credentials: true,
    allowHeaders: [
      "Access-Control-Allow-Headers",
      "Origin",
      "Accept",
      "X-Requested-With",
      "Content-Type",
      "Access-Control-Request-Method",
      "Access-Control-Allow-Origin",
      "Access-Control-Request-Headers",
      "Authorization",
      "device-id",
      "last-event-id",
      "cookie",
      "x-forwarded-for",
      "priority",
    ],
    // preflightContinue: true,
    // optionsSuccessStatus: 204,
    allowMethods: ["POST", "GET", "OPTIONS", "PUT", "PATCH", "DELETE"],

    maxAge: 600,
  })(c, next);
});

app.on(
  ["HEAD", "POST", "GET", "PATCH"],
  ["/uploadista/api/**", "/uploadista/api"],
  (c) => uploadistaServer.handler(c),
);

app.on(
  ["GET"],
  ["/uploadista/ws/upload/:uploadId", "/uploadista/ws/flow/:jobId"],
  upgradeWebSocket(uploadistaServer.websocketHandler),
);

app.use("/uploads/*", serveStatic({ root: join(__dirname, "..") }));

const routes = app;

export type AppType = typeof routes;

const server = serve(
  {
    port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000,
    fetch: routes.fetch,
  },
  (info) => {
    console.log(`Server is running on port ${info.port}`);
  },
);

injectWebSocket(server);

// Graceful shutdown with proper observability cleanup
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Close HTTP server first (stop accepting new requests)
  server.close();

  // Dispose uploadista server (flushes pending traces)
  try {
    await uploadistaServer.dispose();
    console.log("✅ Uploadista server disposed (traces flushed)");
  } catch (err) {
    console.error("Error disposing uploadista server:", err);
  }

  // Close Redis connections
  try {
    await redisClient.quit();
    await redisSubscriberClient.quit();
    console.log("✅ Redis connections closed");
  } catch (err) {
    console.error("Error closing Redis connections:", err);
  }

  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
