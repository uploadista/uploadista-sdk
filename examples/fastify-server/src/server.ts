import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import websocket from "@fastify/websocket";
import { createFastifyUploadistaAdapter } from "@uploadista/adapters-fastify";
import { fileStore } from "@uploadista/data-store-filesystem";
import { imageAiPlugin } from "@uploadista/flow-images-replicate";
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import Fastify from "fastify";
import { flows } from "./flows";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function startServer() {
  // Create Fastify instance with logger
  const fastify = Fastify({
    logger: {
      level: "debug",
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  });

  const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

  // Register plugins
  await fastify.register(websocket);
  await fastify.register(staticPlugin, {
    root: join(__dirname, "../uploads"),
    prefix: "/uploads/",
  });
  await fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["*"],
    credentials: true,
    allowedHeaders: [
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
    methods: ["POST", "GET", "OPTIONS", "PUT", "PATCH", "DELETE"],
    maxAge: 600,
  });

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
  const uploadistaAdapter = await createFastifyUploadistaAdapter({
    dataStore,
    flows,
    plugins: [imagePlugin, imageAiPlugin(process.env.REPLICATE_API_TOKEN)],
    kvStore,
  });

  // Add content type parser for binary upload data (PATCH requests)
  // This tells Fastify to not parse the body, allowing raw stream access
  fastify.addContentTypeParser(
    "application/octet-stream",
    (_req, _payload, done) => {
      done(null);
    },
  );

  // Health check endpoint
  fastify.get("/health", async (_request, reply) => {
    reply.send({
      status: "OK",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  fastify.get("/", async (_request, reply) => {
    reply.send({
      status: "OK",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  // Upload endpoints - handle all methods
  fastify.all("/uploadista/api/*", async (request, reply) => {
    return uploadistaAdapter.handler(request, reply);
  });

  // WebSocket endpoint for upload progress
  fastify.get(
    "/uploadista/ws/upload/:uploadId",
    { websocket: true },
    uploadistaAdapter.websocketHandler,
  );

  // WebSocket endpoint for flow job progress
  fastify.get(
    "/uploadista/ws/flow/:jobId",
    { websocket: true },
    uploadistaAdapter.websocketHandler,
  );

  // Error handling
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);
    reply.status(500).send({
      error: "Internal server error",
      timestamp: new Date().toISOString(),
    });
  });

  // Start server
  try {
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 Fastify server running on port ${port}`);
    console.log(`📁 Upload endpoint: http://localhost:${port}/uploadista/api/`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${port}/uploadista/ws/`);
    console.log(`🏥 Health check: http://localhost:${port}/health`);
    console.log(`📂 Upload directory: ${join(__dirname, "../uploads")}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log("🛑 Shutting down server...");
    await fastify.close();
    console.log("🔌 Server closed");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return fastify;
}

// Start the server
startServer().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
