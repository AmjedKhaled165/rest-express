import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { networkInterfaces } from "os";
import { log } from "./index";

function getLocalNetworkAddress(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    log(`Client connected: ${socket.id}`, "socket.io");

    socket.on("control", (action: string) => {
      log(`Control action received: ${action} from ${socket.id}`, "socket.io");
      socket.broadcast.emit("control", action);
    });

    socket.on("disconnect", () => {
      log(`Client disconnected: ${socket.id}`, "socket.io");
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", message: "Madmappers Tetris server running" });
  });

  // Get local network address for offline multi-device play
  app.get("/api/network-info", (_req, res) => {
    const localIP = getLocalNetworkAddress();
    const port = process.env.PORT || 5000;
    res.json({
      localIP,
      port,
      connectionUrl: localIP ? `http://${localIP}:${port}` : null
    });
  });

  return httpServer;
}
