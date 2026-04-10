import { getRecentFeedingSessions, getTelegramSettings, getSchedulerState, updateSchedulerState } from "./db";
import { sendMessage } from "./telegramBot";
import { format } from "date-fns";

const REMINDER_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3 hours
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SNOOZE_AFTER_REMINDER_MS = 60 * 60 * 1000; // don't re-alert for 1h after each reminder

/** Returns the last time a reminder was sent for a child (ms epoch), or 0 if never. */
export async function getLastReminderSent(child: string): Promise<number> {
  const state = await getSchedulerState();
  if (!state) return 0;
  if (child === "nica") return state.lastFeedingReminderNica ?? 0;
  if (child === "nici") return state.lastFeedingReminderNici ?? 0;
  return 0;
}

// ─── Global snooze ───────────────────────────────────────────────────────────
// Snooze state is persisted in scheduler_state.feedingSnoozeUntil.

/** Snooze all feeding reminders until `until` (ms epoch). */
export async function setSnooze(until: number): Promise<void> {
  await updateSchedulerState({ feedingSnoozeUntil: until });
}

/** Cancel any active snooze immediately. */
export async function clearSnooze(): Promise<void> {
  await updateSchedulerState({ feedingSnoozeUntil: 0 });
}

/** Returns ms remaining in the current snooze, or 0 if not snoozed. */
export async function getSnoozeRemaining(): Promise<number> {
  const state = await getSchedulerState();
  const snoozeUntil = state?.feedingSnoozeUntil ?? 0;
  const remaining = snoozeUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `<1m`;
}

// ─── Check loop ──────────────────────────────────────────────────────────────

let reminderInterval: ReturnType<typeof setInterval> | null = null;

async function checkFeedings() {
  const settings = await getTelegramSettings();
  const chatId = settings?.chatId;
  if (!chatId) return;

  // Respect global snooze
  if (await getSnoozeRemaining() > 0) return;

  const now = Date.now();

  for (const child of ["nica", "nici"] as const) {
    try {
      // Use the withRetry-wrapped helper instead of raw getDb() to survive ECONNRESET
      const rows = await getRecentFeedingSessions(child, 1);

      if (rows.length === 0) continue;

      const lastFeed = rows[0];
      // Use the actual feed end time; fall back to createdAt for bottle/quick-log entries
      const feedEndTime = Math.max(
        lastFeed.leftEnd ?? 0,
        lastFeed.rightEnd ?? 0,
        (lastFeed.leftEnd == null && lastFeed.rightEnd == null) ? lastFeed.createdAt : 0
      );
      const actualFeedTime = feedEndTime > 0 ? feedEndTime : lastFeed.createdAt;
      const elapsed = now - actualFeedTime;

      if (elapsed < REMINDER_THRESHOLD_MS) continue;

      // Don't re-alert within 1h of the last reminder for this child
      const lastSent = await getLastReminderSent(child);
      if (now - lastSent < SNOOZE_AFTER_REMINDER_MS) continue;

      // Persist the reminder timestamp to DB
      const updateData = child === "nica"
        ? { lastFeedingReminderNica: now }
        : { lastFeedingReminderNici: now };
      await updateSchedulerState(updateData);

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
        `<code>/snooze 1h</code> — silence reminders for 1 hour`,
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
