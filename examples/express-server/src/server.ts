import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createExpressUploadistaAdapter } from "@uploadista/adapters-express";
import { createFileStore } from "@uploadista/data-store-filesystem";
import { imageAiPlugin } from "@uploadista/flow-images-replicate";
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import cors from "cors";
import express from "express";
import pinoHttp from "pino-http";
import { WebSocketServer } from "ws";
import { flows } from "./flows";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function startServer() {
  // Create Express app and HTTP server
  const app = express();
  const server = createServer(app);
  const port = process.env.PORT || 3000;

  // Middleware
  app.use(cors());
  app.use(pinoHttp());

  app.use((req, res, next) => {
    if (req.path.startsWith("/uploadista/")) {
      return next();
    }
    express.json()(req, res, next);
  });

  const kvStore = fileKvStore({
    directory: join(__dirname, "../uploads"),
  });

  const dataStore = createFileStore({
    directory: join(__dirname, "../uploads"),
    deliveryUrl: "http://localhost:3000",
  });

  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN is not set");
  }

  // Create upload adapter with proper layer-based configuration
  const uploadistaAdapter = await createExpressUploadistaAdapter({
    kvStore,
    dataStore,
    flows,
    plugins: [imagePlugin, imageAiPlugin(process.env.REPLICATE_API_TOKEN)],
  });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  // Upload endpoints - support all HTTP methods for upload operations
  // Express 5 requires named wildcards - use /*splat syntax
  app.all("/uploadista/api/*splat", uploadistaAdapter.handler);

  // WebSocket server setup for real-time upload progress
  const wss = new WebSocketServer({
    server,
  });

  wss.on("connection", uploadistaAdapter.websocketConnectionHandler);

  // Error handling middleware
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("❌ Server error:", err);
      res.status(500).json({
        error: "Internal server error",
        timestamp: new Date().toISOString(),
      });
    },
  );

  // Start server
  server.listen(port, () => {
    console.log(`🚀 Express server running on port ${port}`);
    console.log(`📁 Upload endpoint: http://localhost:${port}/uploadista/api/`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${port}/uploadista/ws/`);
    console.log(`🏥 Health check: http://localhost:${port}/health`);
    console.log(`📂 Upload directory: ${join(__dirname, "../uploads")}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("🛑 Shutting down server...");

    // Close WebSocket server
    wss.close(() => {
      console.log("📡 WebSocket server closed");
    });

    // Close HTTP server
    server.close(() => {
      console.log("🔌 HTTP server closed");
    });

    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return { app, server, uploadistaAdapter };
}

// Start the server
startServer().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
