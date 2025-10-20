import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { createHonoUploadistaAdapter } from "@uploadista/adapters-hono";
import { fileStore } from "@uploadista/data-store-filesystem";
import { imageAiPlugin } from "@uploadista/flow-images-replicate";
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { fileKvStore } from "@uploadista/kv-store-filesystem";
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

const kvStore = fileKvStore({
  directory: join(__dirname, "../uploads"),
});

const dataStore = fileStore({
  directory: join(__dirname, "../uploads"),
  deliveryUrl: "http://localhost:3000/uploads",
});

if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error("REPLICATE_API_TOKEN is not set");
}

// Create the uploadista adapter
const uploadistaAdapter = await createHonoUploadistaAdapter({
  dataStore,
  flows,
  plugins: [imagePlugin, imageAiPlugin(process.env.REPLICATE_API_TOKEN)],
  kvStore,
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
  uploadistaAdapter.handler,
);

app.on(
  ["GET"],
  ["/uploadista/ws/upload/:uploadId", "/uploadista/ws/flow/:jobId"],
  upgradeWebSocket(uploadistaAdapter.websocketHandler),
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
