import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expressAdapter } from "@uploadista/adapters-express";
import { fileStore } from "@uploadista/data-store-filesystem";
import { imageAiPlugin } from "@uploadista/flow-images-replicate";
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import { createUploadistaServer } from "@uploadista/server";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import pinoHttp from "pino-http";
import { WebSocketServer } from "ws";
import { flows } from "./flows";

dotenv.config();

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

  const dataStore = fileStore({
    directory: join(__dirname, "../uploads"),
    deliveryUrl: "http://localhost:3000",
  });

  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN is not set");
  }

  // Create uploadista server with proper layer-based configuration and express adapter
  const uploadistaServer = await createUploadistaServer({
    kvStore,
    dataStore,
    flows,
    plugins: [imagePlugin, imageAiPlugin(process.env.REPLICATE_API_TOKEN)],
    adapter: expressAdapter({}),
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
  app.all("/uploadista/api/*splat", (request, response, next) => {
    uploadistaServer.handler({ request, response, next });
  });

  // WebSocket server setup for real-time upload progress
  const wss = new WebSocketServer({
    server,
  });

  wss.on("connection", uploadistaServer.websocketHandler);

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

  return { app, server, uploadistaServer };
}

// Start the server
startServer().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
