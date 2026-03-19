import { getTelegramSettings } from "./db";
import { sendTelegramDigest } from "./routers";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let lastSentDate: string | null = null;

function getLocalDateString(offsetMinutes: number): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const localMs = utcMs + offsetMinutes * 60_000;
  const d = new Date(localMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLocalHHMM(offsetMinutes: number): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const localMs = utcMs + offsetMinutes * 60_000;
  const d = new Date(localMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function checkAndSendDigest() {
  try {
    const settings = await getTelegramSettings();
    if (!settings || !settings.enabled || !settings.botToken || !settings.chatId) return;

    const currentHHMM = getLocalHHMM(settings.timezoneOffset);
    const currentDate = getLocalDateString(settings.timezoneOffset);

    // Check if it's time to send and we haven't sent today
    if (currentHHMM === settings.digestTime && lastSentDate !== currentDate) {
      console.log(`[TelegramScheduler] Sending daily digest for ${currentDate}`);
      lastSentDate = currentDate;
      // Use local midnight as the reference date for the digest
      const utcMs = Date.now() + new Date().getTimezoneOffset() * 60_000;
      const localMs = utcMs + settings.timezoneOffset * 60_000;
      await sendTelegramDigest(localMs);
      console.log(`[TelegramScheduler] Digest sent successfully`);
    }
  } catch (err) {
    console.error("[TelegramScheduler] Error:", err);
  }
}

export function startTelegramScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  // Check every minute
  schedulerInterval = setInterval(checkAndSendDigest, 60_000);
  console.log("[TelegramScheduler] Started — checking every minute");
}

export function stopTelegramScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
