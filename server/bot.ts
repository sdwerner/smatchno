/**
 * Standalone Telegram Bot Worker
 *
 * Runs the Telegram bot webhook handler and all scheduled reminders
 * (digest, feeding, vitamin D) as an independent process.
 *
 * Usage:
 *   node dist/bot.js          # production
 *   tsx server/bot.ts          # development
 *
 * When deployed separately from the API server, the bot process is resilient
 * to API server restarts and vice versa. Both share the same database.
 *
 * Environment variables:
 *   DATABASE_URL       — MySQL connection string (required)
 *   BOT_PORT           — HTTP port for the webhook listener (default: 3001)
 *   VITE_APP_URL       — Public URL of the app (for webhook registration)
 *   TELEGRAM_BOT_TOKEN — (optional, seeded into DB on first run)
 *   TELEGRAM_CHAT_ID   — (optional, seeded into DB on first run)
 */
import "dotenv/config";
import express from "express";
import { startTelegramScheduler } from "./telegramScheduler";
import { startFeedingReminder } from "./feedingReminder";
import { startVitaminDReminder } from "./vitaminDReminder";
import { handleWebhookUpdate, setWebhook, notifyDeployment, refreshBotCredentials } from "./telegramBot";
import { seedTelegramSettingsFromEnv } from "./db";

async function startBot() {
  const app = express();
  app.use(express.json());

  // Telegram webhook endpoint
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      await handleWebhookUpdate(req.body);
    } catch (err) {
      console.error("[Webhook] Error:", err);
    }
    res.sendStatus(200);
  });

  // Health check
  app.get("/health", (_req, res) => res.json({ ok: true, process: "bot" }));

  const port = parseInt(process.env.BOT_PORT || "3001");

  app.listen(port, async () => {
    console.log(`[Bot] Worker running on http://localhost:${port}/`);

    // Seed Telegram settings from env vars into DB (one-time),
    // then populate the in-memory cache used by the bot.
    await seedTelegramSettingsFromEnv();
    await refreshBotCredentials();

    // Start schedulers
    startTelegramScheduler();
    startFeedingReminder();
    startVitaminDReminder();

    // Register Telegram webhook
    const appUrl = process.env.VITE_APP_URL || "https://babytrackr-gszrhnzr.manus.space";
    if (process.env.NODE_ENV === "production") {
      try {
        await setWebhook(`${appUrl}/api/telegram/webhook`);
        setTimeout(() => notifyDeployment().catch(console.error), 3000);
      } catch (err) {
        console.error("[Webhook] Failed to register:", err);
      }
    }
  });
}

startBot().catch(console.error);
