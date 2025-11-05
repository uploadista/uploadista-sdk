import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { createClient } from "@redis/client";
import { honoAdapter } from "@uploadista/adapters-hono";
import { s3Store } from "@uploadista/data-store-s3";
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { imageAiPlugin } from "@uploadista/flow-images-replicate";
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { createUploadistaServer } from "@uploadista/server";
import dotenv from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { pinoLogger } from "hono-pino";
import { flows } from "./flows";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = new Hono();

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

const dataStore = s3Store({
  deliveryUrl: process.env.R2_DELIVERY_URL!,
  s3ClientConfig: {
    bucket: process.env.R2_BUCKET!,
    region: "auto",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    endpoint: process.env.R2_ENDPOINT!,
  },
});

if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error("REPLICATE_API_TOKEN is not set");
}

const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  plugins: [imagePlugin, imageAiPlugin(process.env.REPLICATE_API_TOKEN)],
  kvStore,
  eventBroadcaster,
  adapter: honoAdapter(),
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
    port: 3000,
    fetch: routes.fetch,
  },
  (info) => {
    console.log(`Server is running on port ${info.port}`);
  },
);

injectWebSocket(server);

// graceful shutdown
process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  server.close((err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
});
