import axios from "axios";
import { getDb } from "./db";
import { feedingSessions, diaperChanges } from "../drizzle/schema";
import { and, gte, lte, desc, eq } from "drizzle-orm";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

function getBotApi(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[TelegramBot] TELEGRAM_BOT_TOKEN is not set");
  }
  return `https://api.telegram.org/bot${token}`;
}
const APP_URL = process.env.VITE_APP_URL || "https://babytrackr-gszrhnzr.manus.space";

// ─── Telegram API helpers ────────────────────────────────────────────────────

export async function sendMessage(
  chatId: string | number,
  text: string,
  extra?: Record<string, unknown>
) {
  try {
    const api = getBotApi();
    await axios.post(`${api}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...extra,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[TelegramBot] sendMessage error:", msg);
  }
}

export async function setWebhook(webhookUrl: string) {
  const api = getBotApi();
  const res = await axios.post(`${api}/setWebhook`, { url: webhookUrl });
  console.log("[TelegramBot] Webhook set:", res.data);
  return res.data;
}

export async function deleteWebhook() {
  const api = getBotApi();
  const res = await axios.post(`${api}/deleteWebhook`);
  return res.data;
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `<1m`;
}

function parseTime(str: string): { h: number; m: number } | null {
  const match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return { h: parseInt(match[1]), m: parseInt(match[2]) };
}

function timeToMs(h: number, m: number, baseDate: Date): number {
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function childName(raw: string): "nica" | "nici" | null {
  const lower = raw.toLowerCase();
  if (lower === "nica") return "nica";
  if (lower === "nici") return "nici";
  return null;
}

// ─── Daily summary builder ───────────────────────────────────────────────────

export async function buildDailySummary(dateMs: number): Promise<string> {
  const db = await getDb();
  if (!db) return "⚠️ Database not available.";

  const dayStart = startOfDay(new Date(dateMs)).getTime();
  const dayEnd = endOfDay(new Date(dateMs)).getTime();
  const dateLabel = format(new Date(dateMs), "dd.MM.yyyy");

  let msg = `📊 <b>Daily Summary — ${dateLabel}</b>\n\n`;

  for (const child of ["nica", "nici"] as const) {
    const feedings = await db
      .select()
      .from(feedingSessions)
      .where(
        and(
          eq(feedingSessions.child, child),
          gte(feedingSessions.createdAt, dayStart),
          lte(feedingSessions.createdAt, dayEnd)
        )
      );

    const diapers = await db
      .select()
      .from(diaperChanges)
      .where(
        and(
          eq(diaperChanges.child, child),
          gte(diaperChanges.changedAt, dayStart),
          lte(diaperChanges.changedAt, dayEnd)
        )
      );

    let totalMs = 0;
    let lastFeedTime: number | null = null;
    let bottleCount = 0;

    for (const s of feedings) {
      if (s.leftStart && s.leftEnd) totalMs += s.leftEnd - s.leftStart;
      if (s.rightStart && s.rightEnd) totalMs += s.rightEnd - s.rightStart;
      if (s.bottleMl) bottleCount++;
      if (!lastFeedTime || s.createdAt > lastFeedTime) lastFeedTime = s.createdAt;
    }

    const wet = diapers.filter(d => d.type === "wet").length;
    const dirty = diapers.filter(d => d.type === "dirty").length;
    const both = diapers.filter(d => d.type === "both").length;

    const childLabel = child === "nica" ? "👧 <b>Nica</b>" : "👧 <b>Nici</b>";
    msg += `${childLabel}\n`;
    msg += `🤱 Feedings: ${feedings.length} (${formatMs(totalMs)})`;
    if (lastFeedTime) msg += ` · Last: ${format(new Date(lastFeedTime), "HH:mm")}`;
    if (bottleCount > 0) msg += ` · 🍼 ${bottleCount}x bottle`;
    msg += `\n`;
    msg += `💧 Diapers: ${diapers.length} (💧${wet} 💩${dirty} 🔄${both})\n\n`;
  }

  return msg.trim();
}

// ─── Command handlers ────────────────────────────────────────────────────────

async function handleFeed(args: string[], chatId: number) {
  // Usage: /feed nica left 14:00-14:10 [right 14:10-14:20]
  if (args.length < 3) {
    return sendMessage(chatId, `Usage: <code>/feed nica left 14:00-14:10 right 14:10-14:20</code>\nOr just one side: <code>/feed nici right 14:00-14:15</code>`);
  }

  const child = childName(args[0]);
  if (!child) return sendMessage(chatId, "❌ Unknown child. Use <code>nica</code> or <code>nici</code>.");

  const db = await getDb();
  if (!db) return sendMessage(chatId, "⚠️ Database not available.");

  const now = new Date();
  let leftStart: number | null = null;
  let leftEnd: number | null = null;
  let rightStart: number | null = null;
  let rightEnd: number | null = null;

  // Parse pairs: "left 14:00-14:10 right 14:10-14:20"
  for (let i = 1; i < args.length - 1; i++) {
    const side = args[i].toLowerCase();
    const range = args[i + 1];
    const match = range.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (!match) continue;

    const start = parseTime(match[1]);
    const end = parseTime(match[2]);
    if (!start || !end) continue;

    const startMs = timeToMs(start.h, start.m, now);
    const endMs = timeToMs(end.h, end.m, now);

    if (side === "left" || side === "links") {
      leftStart = startMs;
      leftEnd = endMs;
    } else if (side === "right" || side === "rechts") {
      rightStart = startMs;
      rightEnd = endMs;
    }
  }

  if (!leftStart && !rightStart) {
    return sendMessage(chatId, "❌ Could not parse times. Example: <code>/feed nica left 14:00-14:10</code>");
  }

  const createdAt = Date.now();
  await db.insert(feedingSessions).values({
    child,
    leftStart,
    leftEnd,
    rightStart,
    rightEnd,
    bottleMl: null,
    notes: "via bot",
    loggedBy: null,
    createdAt,
  });

  let reply = `✅ Feeding logged for <b>${child === "nica" ? "Nica" : "Nici"}</b>!\n`;
  if (leftStart && leftEnd) reply += `👈 Left: ${formatMs(leftEnd - leftStart)}\n`;
  if (rightStart && rightEnd) reply += `👉 Right: ${formatMs(rightEnd - rightStart)}\n`;
  await sendMessage(chatId, reply);
}

async function handleBottle(args: string[], chatId: number) {
  // Usage: /bottle nica 80
  if (args.length < 2) {
    return sendMessage(chatId, `Usage: <code>/bottle nica 80</code> (amount in ml)`);
  }

  const child = childName(args[0]);
  if (!child) return sendMessage(chatId, "❌ Unknown child. Use <code>nica</code> or <code>nici</code>.");

  const ml = parseInt(args[1]);
  if (isNaN(ml) || ml <= 0) return sendMessage(chatId, "❌ Invalid amount. Example: <code>/bottle nica 80</code>");

  const db = await getDb();
  if (!db) return sendMessage(chatId, "⚠️ Database not available.");

  const createdAt = Date.now();
  await db.insert(feedingSessions).values({
    child,
    leftStart: null,
    leftEnd: null,
    rightStart: null,
    rightEnd: null,
    bottleMl: ml,
    notes: "via bot",
    loggedBy: null,
    createdAt,
  });

  await sendMessage(chatId, `✅ 🍼 Bottle feeding logged for <b>${child === "nica" ? "Nica" : "Nici"}</b>: <b>${ml} ml</b>`);
}

async function handleDiaper(args: string[], chatId: number) {
  // Usage: /diaper nici wet
  if (args.length < 2) {
    return sendMessage(chatId, `Usage: <code>/diaper nica wet</code>\nTypes: <code>wet</code>, <code>dirty</code>, <code>both</code>`);
  }

  const child = childName(args[0]);
  if (!child) return sendMessage(chatId, "❌ Unknown child. Use <code>nica</code> or <code>nici</code>.");

  const typeMap: Record<string, "wet" | "dirty" | "both"> = {
    wet: "wet", nass: "wet",
    dirty: "dirty", schmutzig: "dirty",
    both: "both", beides: "both",
  };
  const type = typeMap[args[1].toLowerCase()];
  if (!type) return sendMessage(chatId, "❌ Unknown type. Use <code>wet</code>, <code>dirty</code>, or <code>both</code>.");

  const db = await getDb();
  if (!db) return sendMessage(chatId, "⚠️ Database not available.");

  const now = Date.now();
  await db.insert(diaperChanges).values({
    child,
    type,
    notes: "via bot",
    loggedBy: null,
    changedAt: now,
    createdAt: now,
  });

  const icons: Record<string, string> = { wet: "💧", dirty: "💩", both: "🔄" };
  await sendMessage(chatId, `✅ ${icons[type]} Diaper change logged for <b>${child === "nica" ? "Nica" : "Nici"}</b>: <b>${type}</b>`);
}

async function handleToday(chatId: number) {
  const summary = await buildDailySummary(Date.now());
  await sendMessage(chatId, summary, {
    reply_markup: {
      inline_keyboard: [[
        { text: "📱 Open App", web_app: { url: APP_URL } }
      ]]
    }
  });
}

async function handleSummary(args: string[], chatId: number) {
  // Usage: /summary 19.03 or /summary 19.03.2026
  let targetDate = new Date();

  if (args.length > 0) {
    const match = args[0].match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
      targetDate = new Date(year, month, day);
    }
  }

  const summary = await buildDailySummary(targetDate.getTime());
  await sendMessage(chatId, summary);
}

async function handleLast(chatId: number) {
  const db = await getDb();
  if (!db) return sendMessage(chatId, "⚠️ Database not available.");

  let msg = "🕐 <b>Last feedings</b>\n\n";

  for (const child of ["nica", "nici"] as const) {
    const rows = await db
      .select()
      .from(feedingSessions)
      .where(eq(feedingSessions.child, child))
      .orderBy(desc(feedingSessions.createdAt))
      .limit(1);

    const childLabel = child === "nica" ? "👧 Nica" : "👧 Nici";
    if (rows.length === 0) {
      msg += `${childLabel}: No feedings recorded\n`;
    } else {
      const last = rows[0];
      const ago = Date.now() - last.createdAt;
      const agoStr = formatMs(ago);
      msg += `${childLabel}: ${format(new Date(last.createdAt), "HH:mm")} (<b>${agoStr} ago</b>)\n`;
    }
  }

  await sendMessage(chatId, msg);
}

async function handleHelp(chatId: number) {
  await sendMessage(chatId, `🍼 <b>Baby Tracker Commands</b>

<b>Log feeding:</b>
<code>/feed nica left 14:00-14:10 right 14:10-14:20</code>
<code>/feed nici right 15:00-15:12</code>

<b>Log bottle:</b>
<code>/bottle nica 80</code>

<b>Log diaper:</b>
<code>/diaper nica wet</code>
<code>/diaper nici dirty</code>
<code>/diaper nica both</code>

<b>Analytics:</b>
<code>/today</code> — today's summary
<code>/summary 19.03</code> — summary for a date
<code>/last</code> — last feeding per child

<b>Open app:</b> Tap the menu button 📱`, {
    reply_markup: {
      inline_keyboard: [[
        { text: "📱 Open Baby Tracker", web_app: { url: APP_URL } }
      ]]
    }
  });
}

// ─── Main webhook dispatcher ─────────────────────────────────────────────────

export async function handleWebhookUpdate(update: TelegramUpdate) {
  const message = update.message || update.edited_message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (!text.startsWith("/")) return;

  // Strip bot username suffix (e.g. /feed@smatchno_bot → /feed)
  const [rawCmd, ...args] = text.replace(/@\w+/, "").slice(1).split(/\s+/);
  const cmd = rawCmd.toLowerCase();

  console.log(`[TelegramBot] Command: /${cmd} args:`, args);

  try {
    switch (cmd) {
      case "feed":   return await handleFeed(args, chatId);
      case "bottle": return await handleBottle(args, chatId);
      case "diaper": return await handleDiaper(args, chatId);
      case "today":  return await handleToday(chatId);
      case "summary":return await handleSummary(args, chatId);
      case "last":   return await handleLast(chatId);
      case "help":
      case "start":  return await handleHelp(chatId);
      default:
        return await sendMessage(chatId, `❓ Unknown command. Send /help to see all commands.`);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TelegramBot] Error handling /${cmd}:`, errMsg);
    await sendMessage(chatId, `⚠️ Something went wrong processing your command. Please try again.`);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; username?: string; first_name?: string };
  chat: { id: number; type: string; title?: string };
  text?: string;
  date: number;
}
