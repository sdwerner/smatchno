import { getRecentFeedingSessions } from "./db";
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
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  const now = Date.now();

  for (const child of ["nica", "nici"] as const) {
    try {
      // Use the withRetry-wrapped helper instead of raw getDb() to survive ECONNRESET
      const rows = await getRecentFeedingSessions(child, 1);

      if (rows.length === 0) continue;

      const lastFeed = rows[0];
      // Use the actual feed time (leftStart, rightStart, or createdAt for bottle/quick-log)
      // leftEnd/rightEnd is the end of the feed; use the most recent end time as the "last fed" time
      const feedEndTime = Math.max(
        lastFeed.leftEnd ?? 0,
        lastFeed.rightEnd ?? 0,
        // For bottle feeds (no leftEnd/rightEnd), use createdAt
        (lastFeed.leftEnd == null && lastFeed.rightEnd == null) ? lastFeed.createdAt : 0
      );
      const actualFeedTime = feedEndTime > 0 ? feedEndTime : lastFeed.createdAt;
      const elapsed = now - actualFeedTime;

      if (elapsed < REMINDER_THRESHOLD_MS) continue;

      // Check snooze: don't send another reminder within 1h of the last one
      const lastSent = lastReminderSent[child] ?? 0;
      if (now - lastSent < SNOOZE_AFTER_REMINDER_MS) continue;

      lastReminderSent[child] = now;

      const childLabel = child === "nica" ? "Nica" : "Nici";
      const lastTimeStr = format(new Date(actualFeedTime), "HH:mm");
      const elapsedStr = formatMs(elapsed);

      const childIcon = child === "nica" ? "👧" : "👶";
      const msg = [
        `⏰ ${childIcon} <b>${childLabel}</b> — feeding reminder!`,
        ``,
        `🇬🇧 Last fed at <b>${lastTimeStr}</b> — <b>${elapsedStr} ago</b>`,
        `🇩🇪 Letzte Mahlzeit um <b>${lastTimeStr}</b> — vor <b>${elapsedStr}</b>`,
        `🇺🇦 Останнє годування о <b>${lastTimeStr}</b> — <b>${elapsedStr} тому</b>`,
        ``,
        `<code>/log ${child} left HH:MM-HH:MM</code>`,
      ].join("\n");

      await sendMessage(chatId, msg);

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
