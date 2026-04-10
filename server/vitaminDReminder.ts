/**
 * Vitamin D Reminder
 *
 * Checks every 30 minutes whether each child has received their daily Vitamin D.
 * If not logged by noon Vienna time, sends a reminder every 2 hours until logged.
 */

import { hasVitaminDToday, getTelegramSettings, getSchedulerState, updateSchedulerState } from "./db";
import { sendMessage } from "./telegramBot";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { startOfDay, endOfDay } from "date-fns";

const APP_TZ = "Europe/Vienna";
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours between reminders
const NOON_HOUR = 12; // Only start reminding after noon Vienna time

let reminderInterval: ReturnType<typeof setInterval> | null = null;

function viennaDayStart(nowMs: number): number {
  return fromZonedTime(startOfDay(toZonedTime(new Date(nowMs), APP_TZ)), APP_TZ).getTime();
}

function viennaDayEnd(nowMs: number): number {
  return fromZonedTime(endOfDay(toZonedTime(new Date(nowMs), APP_TZ)), APP_TZ).getTime();
}

function getViennaHour(nowMs: number): number {
  const viennaDate = toZonedTime(new Date(nowMs), APP_TZ);
  return viennaDate.getHours();
}

async function checkVitaminD() {
  const settings = await getTelegramSettings();
  const chatId = settings?.chatId;
  if (!chatId) return;

  const now = Date.now();
  const viennaHour = getViennaHour(now);

  // Only remind after noon (12:00) Vienna time
  if (viennaHour < NOON_HOUR) return;

  // Don't remind late at night (after 22:00)
  if (viennaHour >= 22) return;

  const dayStartMs = viennaDayStart(now);
  const dayEndMs = viennaDayEnd(now);

  // Read persisted state from DB
  const state = await getSchedulerState();

  for (const child of ["nica", "nici"] as const) {
    try {
      const alreadyGiven = await hasVitaminDToday(child, dayStartMs, dayEndMs);
      if (alreadyGiven) continue;

      // Check snooze: don't send another reminder within 2h of the last one
      const lastSent = child === "nica"
        ? (state?.lastVitaminDReminderNica ?? 0)
        : (state?.lastVitaminDReminderNici ?? 0);
      if (now - lastSent < REMINDER_INTERVAL_MS) continue;

      // Persist the reminder timestamp to DB
      const updateData = child === "nica"
        ? { lastVitaminDReminderNica: now }
        : { lastVitaminDReminderNici: now };
      await updateSchedulerState(updateData);

      const childLabel = child === "nica" ? "Nica" : "Nici";
      const childIcon = child === "nica" ? "👧" : "👶";

      const msg = [
        `💊 ${childIcon} <b>${childLabel}</b> — Vitamin D reminder!`,
        ``,
        `🇬🇧 <b>${childLabel}</b> hasn't received Vitamin D today yet.`,
        `🇩🇪 <b>${childLabel}</b> hat heute noch kein Vitamin D bekommen.`,
        `🇺🇦 <b>${childLabel}</b> ще не отримала Вітамін D сьогодні.`,
        ``,
        `<code>/log ${child} vitd</code>`,
      ].join("\n");

      await sendMessage(chatId, msg);
      console.log(`[VitaminDReminder] Sent reminder for ${child}`);
    } catch (err) {
      console.error(`[VitaminDReminder] Error checking ${child}:`, err);
    }
  }
}

export function startVitaminDReminder() {
  if (reminderInterval) clearInterval(reminderInterval);
  reminderInterval = setInterval(checkVitaminD, CHECK_INTERVAL_MS);
  console.log("[VitaminDReminder] Started — checking every 30 minutes");
}

export function stopVitaminDReminder() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}
