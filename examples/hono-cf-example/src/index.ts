import {
  createHonoUploadistaAdapter,
  type HonoUploadistaAdapter,
} from "@uploadista/adapters-hono";
import { r2Store } from "@uploadista/data-store-r2";
import { cloudflareKvStore } from "@uploadista/kv-store-cloudflare-kv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { pinoLogger } from "hono-pino";
import { flows } from "./flows";

type Env = {
  UPLOADISTA_KV: KVNamespace;
  UPLOADISTA_BUCKET: R2Bucket;
  R2_DELIVERY_URL: string;
  R2_BUCKET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ENDPOINT: string;
  ALLOWED_ORIGINS: string;
};

type Variables = {
  uploadistaAdapter: HonoUploadistaAdapter;
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
    r2Bucket: bucket as any,
  });

  // Create the uploadista adapter
  const uploadistaAdapter = await createHonoUploadistaAdapter({
    dataStore,
    flows,
    plugins: [],
    kvStore,
  });

  c.set("uploadistaAdapter", uploadistaAdapter);

  return next();
});

app.on(
  ["HEAD", "POST", "GET", "PATCH"],
  ["/uploadista/api/**", "/uploadista/api"],
  (c) => c.get("uploadistaAdapter").handler(c),
);

// app.on(
//   ["GET"],
//   ["/uploadista/ws/upload/:uploadId", "/uploadista/ws/flow/:jobId"],
//   (c) => upgradeWebSocket(c.get("uploadistaAdapter").websocketHandler),
// );

const routes = app;

export type AppType = typeof routes;

export default {
  fetch: app.fetch,
};
