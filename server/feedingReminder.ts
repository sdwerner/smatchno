import { getDb } from "./db";
import { feedingSessions } from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { sendMessage } from "./telegramBot";
import { format } from "date-fns";

const REMINDER_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3 hours
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SNOOZE_AFTER_REMINDER_MS = 60 * 60 * 1000; // don't re-alert for 1h after each reminder

const lastReminderSent: Record<string, number> = {};

let reminderInterval: ReturnType<typeof setInterval> | null = null;

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `<1m`;
}

async function checkFeedings() {
  const db = await getDb();
  if (!db) return;

  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  const now = Date.now();

  for (const child of ["nica", "nici"] as const) {
    try {
      const rows = await db
        .select()
        .from(feedingSessions)
        .where(eq(feedingSessions.child, child))
        .orderBy(desc(feedingSessions.createdAt))
        .limit(1);

      if (rows.length === 0) continue;

      const lastFeed = rows[0];
      const elapsed = now - lastFeed.createdAt;

      if (elapsed < REMINDER_THRESHOLD_MS) continue;

      // Check snooze: don't send another reminder within 1h of the last one
      const lastSent = lastReminderSent[child] ?? 0;
      if (now - lastSent < SNOOZE_AFTER_REMINDER_MS) continue;

      lastReminderSent[child] = now;

      const childLabel = child === "nica" ? "Nica" : "Nici";
      const lastTimeStr = format(new Date(lastFeed.createdAt), "HH:mm");
      const elapsedStr = formatMs(elapsed);

      await sendMessage(
        chatId,
        `⏰ <b>Feeding reminder!</b>\n\n👧 <b>${childLabel}</b> was last fed at <b>${lastTimeStr}</b> — that's <b>${elapsedStr} ago</b>.\n\nTime for the next feeding? 🤱`,
        {
          reply_markup: {
            inline_keyboard: [[
              {
                text: "📱 Log Feeding",
                web_app: { url: process.env.VITE_APP_URL || "https://babytrackr-gszrhnzr.manus.space" }
              }
            ]]
          }
        }
      );

      console.log(`[FeedingReminder] Sent reminder for ${child} (${elapsedStr} since last feed)`);
    } catch (err) {
      console.error(`[FeedingReminder] Error checking ${child}:`, err);
    }
  }
}

export function startFeedingReminder() {
  if (reminderInterval) clearInterval(reminderInterval);
  reminderInterval = setInterval(checkFeedings, CHECK_INTERVAL_MS);
  console.log("[FeedingReminder] Started — checking every 5 minutes");
}

export function stopFeedingReminder() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}
