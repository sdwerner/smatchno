import "dotenv/config";
import express from "express";
import { startTelegramScheduler } from "../telegramScheduler";
import { startFeedingReminder } from "../feedingReminder";
import { startVitaminDReminder } from "../vitaminDReminder";
import { handleWebhookUpdate, setWebhook, notifyDeployment, refreshBotCredentials } from "../telegramBot";
import { seedTelegramSettingsFromEnv } from "../db";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Telegram webhook endpoint
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      await handleWebhookUpdate(req.body);
    } catch (err) {
      console.error("[Webhook] Error:", err);
    }
    res.sendStatus(200);
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Seed Telegram settings from env vars into DB (one-time),
    // then populate the in-memory cache used by the bot.
    await seedTelegramSettingsFromEnv();
    await refreshBotCredentials();

    startTelegramScheduler();
    startFeedingReminder();
    startVitaminDReminder();
    // Register Telegram webhook if credentials are available
    const appUrl = process.env.VITE_APP_URL || "https://babytrackr-gszrhnzr.manus.space";
    if (process.env.NODE_ENV === "production") {
      try {
        await setWebhook(`${appUrl}/api/telegram/webhook`);
        // Small delay to ensure webhook is registered before sending notification
        setTimeout(() => notifyDeployment().catch(console.error), 3000);
      } catch (err) {
        console.error("[Webhook] Failed to register:", err);
      }
    }
  });
}

startServer().catch(console.error);
