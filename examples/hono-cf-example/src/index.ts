import { honoDurableObjectAdapter } from "@uploadista/adapters-hono";
import { r2Store } from "@uploadista/data-store-r2";
import { durableObjectEventEmitter } from "@uploadista/event-emitter-durable-object";
import { imagePluginServerless } from "@uploadista/flow-images-photon/serverless";
import { cloudflareKvStore } from "@uploadista/kv-store-cloudflare-kv";
import {
  createUploadistaServer,
  type UploadistaServer,
} from "@uploadista/server";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { pinoLogger } from "hono-pino";
import { flows } from "./flows";

type Env = {
  UPLOADISTA_KV: KVNamespace;
  UPLOADISTA_BUCKET: R2Bucket;
  UPLOADISTA_DO: DurableObjectNamespace;
  R2_DELIVERY_URL: string;
  R2_BUCKET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ENDPOINT: string;
  ALLOWED_ORIGINS: string;
};

type Variables = {
  uploadistaServer: UploadistaServer<
    Context,
    Response,
    (c: Context) => Promise<Response>
  >;
};

const app = new Hono<{ Variables: Variables; Bindings: Env }>();

app.use(
  pinoLogger({
    pino: { level: "debug" },
  }),
);

app.use("*", async (c, next) => {
  return cors({
    origin: [...(c.env.ALLOWED_ORIGINS?.split(",") ?? ["*"])],

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

app.use("*", async (c, next) => {
  const kvStore = cloudflareKvStore({
    kv: c.env.UPLOADISTA_KV,
  });

  const bucket = c.env.UPLOADISTA_BUCKET;

  const dataStore = r2Store({
    deliveryUrl: c.env.R2_DELIVERY_URL,
    bucket: c.env.R2_BUCKET,
    r2Bucket: bucket,
  });

  // Create the uploadista server with Durable Objects adapter
  const uploadistaServer = await createUploadistaServer({
    dataStore,
    flows,
    plugins: [imagePluginServerless],
    eventEmitter: durableObjectEventEmitter({
      durableObject: c.env.UPLOADISTA_DO as any,
    }),
    kvStore,
    adapter: honoDurableObjectAdapter<{ Variables: Variables; Bindings: Env }>({
      durableObjectNamespace: (ctx) => ctx.env.UPLOADISTA_DO as any,
    }),
  });

  c.set("uploadistaServer", uploadistaServer);

  return next();
});

// HTTP API routes
app.on(
  ["HEAD", "POST", "GET", "PATCH"],
  ["/uploadista/api/**", "/uploadista/api"],
  (c) => c.get("uploadistaServer").handler(c),
);

// WebSocket routes - Handled by adapter, which routes to Durable Objects
app.on(
  ["GET"],
  ["/uploadista/ws/upload/:uploadId", "/uploadista/ws/flow/:jobId"],
  (c) => {
    return c.get("uploadistaServer").websocketHandler(c);
  },
);

const routes = app;

export type AppType = typeof routes;

// Export the Durable Object class
export { UploadistaDurableObject } from "./durable-object";

export default {
  fetch: app.fetch,
};
