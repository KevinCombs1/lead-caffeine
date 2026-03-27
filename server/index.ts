import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

process.on("uncaughtException", (err) => {
  console.error("[PROCESS] Uncaught exception (kept alive):", err.stack || err.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[PROCESS] Unhandled rejection (kept alive):", reason instanceof Error ? (reason.stack || reason.message) : reason);
});

const app = express();
const httpServer = createServer(app);

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
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`serving on port ${port}`);
      try {
        const { cleanupOrphanedRunningJobs } = await import("./carpenter-engine");
        await cleanupOrphanedRunningJobs();
      } catch (err: any) {
        log(`carpenter orphan cleanup error: ${err.message}`);
      }
    },
  );
})();
