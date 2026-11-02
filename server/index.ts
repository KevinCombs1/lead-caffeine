import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { mkdirSync } from "fs";

// Prevent crashes during startup when dependent services (DB, Redis, ClickHouse)
// are temporarily unavailable. Once they come up, connections retry automatically.
process.on("uncaughtException", (err) => {
  if (err.message?.includes("ENOTFOUND") || err.message?.includes("ECONNREFUSED") || err.message?.includes("connect")) {
    console.error("[startup] Non-fatal connection error (service still starting):", err.message);
    return;
  }
  console.error("[startup] Uncaught exception:", err);
});
process.on("unhandledRejection", (err: any) => {
  if (err?.message?.includes("ENOTFOUND") || err?.message?.includes("ECONNREFUSED") || err?.message?.includes("connect")) {
    console.error("[startup] Non-fatal connection rejection (service still starting):", err?.message);
    return;
  }
  console.error("[startup] Unhandled rejection:", err);
});

const app = express();
const httpServer = createServer(app);

// Ensure the creative upload directory exists on the persistent disk
// (Render mounts the persistent disk at /data). Created at boot so the
// creative serving + upload routes work immediately.
try {
  mkdirSync("/data/creatives", { recursive: true });
} catch (err: any) {
  console.warn("[startup] Could not create /data/creatives directory:", err.message);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// Health check — registered BEFORE Vite middleware so it always responds
// even when the event loop is under pressure from discovery workers.
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    memMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    const { seedHiveData } = await import("./hive-seed");
    await seedHiveData();
  } catch (err: any) {
    console.log("[hive-seed] Seed skipped or error:", err.message);
  }

  try {
    const { cleanupOrphanedCrawlJobs, getActiveEngine } = await import("./hive-engine");
    await cleanupOrphanedCrawlJobs();
    setTimeout(async () => {
      try {
        if (!getActiveEngine()) {
          await cleanupOrphanedCrawlJobs();
        }
      } catch (err: any) {
        console.log("[hive-engine] Delayed orphan cleanup error:", err.message);
      }
    }, 10000);
  } catch (err: any) {
    console.log("[hive-engine] Orphan cleanup error:", err.message);
  }

  try {
    const { seedCompassData } = await import("./compass-seed");
    await seedCompassData();
  } catch (err: any) {
    console.log("[compass-seed] Seed skipped or error:", err.message);
  }

  try {
    const { cleanupOrphanedCompassJobs } = await import("./compass-engine");
    await cleanupOrphanedCompassJobs();
  } catch (err: any) {
    console.log("[compass-engine] Orphan cleanup error:", err.message);
  }

  try {
    const { cleanupSupremeJobs } = await import("./supreme-engine");
    await cleanupSupremeJobs();
  } catch (err: any) {
    console.log("[supreme-engine] Orphan cleanup error:", err.message);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: process.env.HOST || "0.0.0.0",
    },
    async () => {
      log(`serving on port ${port}`);
      try {
        const { cleanupOrphanedRunningJobs } = await import("./carpenter-engine");
        await cleanupOrphanedRunningJobs();
      } catch (err: any) {
        log(`carpenter orphan cleanup error: ${err.message}`);
      }
      try {
        const { startEmailQueue } = await import("./email-engine");
        await startEmailQueue();
        log(`email queue started`);
      } catch (err: any) {
        log(`email queue start error: ${err.message}`);
      }
    },
  );
})();
