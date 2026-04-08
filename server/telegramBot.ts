import axios from "axios";
import { getDb, deleteLastFeedingSession, deleteLastDiaperChange, insertFeedingSession, insertDiaperChange, getLastFeedingSession, getLastDiaperChange, getFeedingSessionsForDay, getDiaperChangesForDay } from "./db";
import { setSnooze, clearSnooze, getSnoozeRemaining, getLastReminderSent } from "./feedingReminder";
import { feedingSessions, diaperChanges } from "../drizzle/schema";
import { and, gte, lte, desc, eq } from "drizzle-orm";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

// All user-facing times are in Vienna local time (CET/CEST = UTC+1/UTC+2)
const APP_TZ = "Europe/Vienna";

// Track server start time for /version uptime display
const SERVER_START_MS = Date.now();

/** Convert a UTC timestamp to a Date object in Vienna local time for date-fns operations */
function toVienna(ms: number): Date {
  return toZonedTime(new Date(ms), APP_TZ);
}

/** Convert a Vienna-local Date back to a UTC timestamp (ms) */
function fromVienna(d: Date): number {
  return fromZonedTime(d, APP_TZ).getTime();
}

/** Format a UTC timestamp using Vienna local time */
function fmtVienna(ms: number, fmt: string): string {
  return formatInTimeZone(new Date(ms), APP_TZ, fmt);
}

/** Vienna-aware startOfDay → UTC ms */
function viennaDayStart(ms: number): number {
  return fromVienna(startOfDay(toVienna(ms)));
}

/** Vienna-aware endOfDay → UTC ms */
function viennaDayEnd(ms: number): number {
  return fromVienna(endOfDay(toVienna(ms)));
}

// Read token lazily so env vars are available after server startup
function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}
function getApiBase(): string {
  return `https://api.telegram.org/bot${getBotToken()}`;
}
const APP_URL = process.env.VITE_APP_URL || "https://babytrackr-gszrhnzr.manus.space";

// ─── Language detection ──────────────────────────────────────────────────────

type Lang = "de" | "en" | "uk";

const LANG_PATTERNS: Record<Lang, RegExp[]> = {
  de: [/\b(links|rechts|brust|flasche|windel|nass|schmutzig|beides|heute|woche)\b/i],
  uk: [/[\u0400-\u04FF]/], // Cyrillic characters
  en: [/\b(left|right|breast|bottle|diaper|wet|dirty|both|today|week)\b/i],
};

function detectLang(text: string, userLangCode?: string): Lang {
  // Check message content first
  for (const [lang, patterns] of Object.entries(LANG_PATTERNS) as [Lang, RegExp[]][]) {
    if (patterns.some(p => p.test(text))) return lang;
  }
  // Fall back to Telegram user language code
  if (userLangCode) {
    if (userLangCode.startsWith("de")) return "de";
    if (userLangCode.startsWith("uk")) return "uk";
  }
  return "en";
}

// ─── Multilingual strings ────────────────────────────────────────────────────

const T = {
  dbUnavailable: {
    en: "⚠️ Database not available. Please try again shortly.",
    de: "⚠️ Datenbank nicht verfügbar. Bitte kurz warten.",
    uk: "⚠️ База даних недоступна. Спробуйте ще раз.",
  },
  unknownChild: {
    en: "❌ Unknown child. Use <code>nica</code> or <code>nici</code>.",
    de: "❌ Unbekanntes Kind. Nutze <code>nica</code> oder <code>nici</code>.",
    uk: "❌ Невідома дитина. Використовуй <code>nica</code> або <code>nici</code>.",
  },
  unknownCommand: {
    en: "❓ Unknown command. Send /help to see all commands.",
    de: "❓ Unbekannter Befehl. Sende /help für alle Befehle.",
    uk: "❓ Невідома команда. Надішли /help для списку команд.",
  },
  analyticsBtn: {
    en: "📊 Analytics Dashboard",
    de: "📊 Analyse-Dashboard",
    uk: "📊 Аналітика",
  },
  openApp: {
    en: "📱 Open Dashboard",
    de: "📱 Dashboard öffnen",
    uk: "📱 Відкрити дашборд",
  },
};

function t(key: keyof typeof T, lang: Lang): string {
  return T[key][lang];
}

// ─── Telegram API helpers ────────────────────────────────────────────────────

export async function sendMessage(
  chatId: string | number,
  text: string,
  extra?: Record<string, unknown>
) {
  try {
    await axios.post(`${getApiBase()}/sendMessage`, {
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
  const res = await axios.post(`${getApiBase()}/setWebhook`, { url: webhookUrl });
  console.log("[TelegramBot] Webhook set:", res.data);
  // Register bot commands in BotFather menu after setting the webhook
  await registerBotCommands().catch(err => console.warn("[TelegramBot] setMyCommands failed:", err.message));
  return res.data;
}

export async function registerBotCommands() {
  const commands = [
    { command: "log",     description: "Log feeding or diaper (e.g. /log nica left)" },
    { command: "last",   description: "Last feeding + diaper per child" },
    { command: "today",  description: "Today\u2019s summary" },
    { command: "week",   description: "Last 7 days summary" },
    { command: "summary",description: "Summary for a specific date (DD.MM)" },
    { command: "snooze", description: "Snooze reminders (e.g. /snooze 2h, /snooze off)" },
    { command: "status", description: "Show DB status, last reminders & snooze state" },
    { command: "delete", description: "Delete last entry for a child" },
    { command: "settings",description: "Show config & open settings" },
    { command: "version",description: "Show version & uptime" },
    { command: "help",   description: "Show all commands" },
  ];
  const res = await axios.post(`${getApiBase()}/setMyCommands`, { commands });
  console.log("[TelegramBot] Bot commands registered:", res.data);
  return res.data;
}

export async function deleteWebhook() {
  const res = await axios.post(`${getApiBase()}/deleteWebhook`);
  return res.data;
}

function analyticsButton(lang: Lang) {
  return {
    reply_markup: {
      inline_keyboard: [[
        // Use url type (not web_app) so it works in regular groups as well as supergroups
        { text: t("analyticsBtn", lang), url: APP_URL }
      ]]
    }
  };
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
  // Accept HH:MM or bare hour H (e.g. "9" → 9:00, from voice "nine o'clock")
  const fullMatch = str.match(/^(\d{1,2}):(\d{2})$/);
  if (fullMatch) return { h: parseInt(fullMatch[1]), m: parseInt(fullMatch[2]) };
  const bareMatch = str.match(/^(\d{1,2})$/);
  if (bareMatch) {
    const h = parseInt(bareMatch[1]);
    if (h >= 0 && h <= 23) return { h, m: 0 };
  }
  return null;
}

function timeToMs(h: number, m: number, baseDate: Date): number {
  // baseDate is already a Vienna-zoned date (from toVienna or parseDatePrefix)
  // We set the hours on it and convert back to UTC
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return fromVienna(d);
}

function childName(raw: string): "nica" | "nici" | null {
  const lower = raw.toLowerCase();
  if (lower === "nica") return "nica";
  if (lower === "nici") return "nici";
  return null;
}

// ─── Daily summary builder ───────────────────────────────────────────────────

export async function buildDailySummary(dateMs: number, lang: Lang = "en"): Promise<string> {
  const dayStart = viennaDayStart(dateMs);
  const dayEnd = viennaDayEnd(dateMs);
  const dateLabel = fmtVienna(dateMs, "dd.MM.yyyy");

  const headers: Record<Lang, string> = {
    en: `📊 <b>Daily Summary — ${dateLabel}</b>`,
    de: `📊 <b>Tagesübersicht — ${dateLabel}</b>`,
    uk: `📊 <b>Зведення за день — ${dateLabel}</b>`,
  };

  let msg = `${headers[lang]}\n\n`;

  for (const child of ["nica", "nici"] as const) {
    // Use withRetry-wrapped helpers to survive ECONNRESET
    const feedings = await getFeedingSessionsForDay(child, dayStart, dayEnd);
    const diapers = await getDiaperChangesForDay(child, dayStart, dayEnd);

    let totalMs = 0;
    let lastFeedTime: number | null = null;
    let bottleCount = 0;
    let bottleTotalMl = 0;

    for (const s of feedings) {
      if (s.leftStart && s.leftEnd) totalMs += s.leftEnd - s.leftStart;
      if (s.rightStart && s.rightEnd) totalMs += s.rightEnd - s.rightStart;
      if (s.bottleMl) { bottleCount++; bottleTotalMl += s.bottleMl; }
      if (!lastFeedTime || s.createdAt > lastFeedTime) lastFeedTime = s.createdAt;
    }

    const wet = diapers.filter(d => d.type === "wet").length;
    const dirty = diapers.filter(d => d.type === "dirty").length;
    const both = diapers.filter(d => d.type === "both").length;

    const childLabel = child === "nica" ? "👧 <b>Nica</b>" : "👶 <b>Nici</b>";
    const lastStr = lastFeedTime ? fmtVienna(lastFeedTime, "HH:mm") : "—";

    const feedingLabel: Record<Lang, string> = {
      en: "Feedings", de: "Stillsitzungen", uk: "Годування",
    };
    const lastLabel: Record<Lang, string> = {
      en: "Last", de: "Letzte", uk: "Остання",
    };
    const diaperLabel: Record<Lang, string> = {
      en: "Diapers", de: "Windeln", uk: "Підгузки",
    };
    const bottleLabel: Record<Lang, string> = {
      en: "Bottle", de: "Flasche", uk: "Пляшечка",
    };

    msg += `${childLabel}\n`;
    msg += `🤱 ${feedingLabel[lang]}: <b>${feedings.length}</b>`;
    if (totalMs > 0) msg += ` (${formatMs(totalMs)})`;
    msg += ` · ${lastLabel[lang]}: <b>${lastStr}</b>\n`;
    if (bottleCount > 0) msg += `🍼 ${bottleLabel[lang]}: ${bottleCount}× (${bottleTotalMl} ml)\n`;
    msg += `💧 ${diaperLabel[lang]}: <b>${diapers.length}</b> (💧${wet} 💩${dirty} 🔄${both})\n\n`;
  }

  return msg.trim();
}

// ─── Weekly summary builder ──────────────────────────────────────────────────

async function buildWeeklySummary(lang: Lang): Promise<string> {
  const now = Date.now();
  const weekStart = viennaDayStart(subDays(new Date(now), 6).getTime());
  const weekEnd = viennaDayEnd(now);

  const headers: Record<Lang, string> = {
    en: "📈 <b>Weekly Summary (last 7 days)</b>",
    de: "📈 <b>Wochenübersicht (letzte 7 Tage)</b>",
    uk: "📈 <b>Тижневе зведення (7 днів)</b>",
  };

  let msg = `${headers[lang]}\n\n`;

  for (const child of ["nica", "nici"] as const) {
    // Use withRetry-wrapped helpers to survive ECONNRESET
    const feedings = await getFeedingSessionsForDay(child, weekStart, weekEnd);
    const diapers = await getDiaperChangesForDay(child, weekStart, weekEnd);

    let totalMs = 0;
    let bottleTotalMl = 0;
    for (const s of feedings) {
      if (s.leftStart && s.leftEnd) totalMs += s.leftEnd - s.leftStart;
      if (s.rightStart && s.rightEnd) totalMs += s.rightEnd - s.rightStart;
      if (s.bottleMl) bottleTotalMl += s.bottleMl;
    }

    const avgFeeds = (feedings.length / 7).toFixed(1);
    const avgDiapers = (diapers.length / 7).toFixed(1);
    const childLabel = child === "nica" ? "👧 <b>Nica</b>" : "👶 <b>Nici</b>";

    const totalLabel: Record<Lang, string> = {
      en: "Total feedings", de: "Gesamt Stillsitzungen", uk: "Всього годувань",
    };
    const avgLabel: Record<Lang, string> = {
      en: "Avg/day", de: "Ø/Tag", uk: "Сер/день",
    };
    const timeLabel: Record<Lang, string> = {
      en: "Breast time", de: "Stillzeit", uk: "Час грудного",
    };
    const diaperTotalLabel: Record<Lang, string> = {
      en: "Total diapers", de: "Gesamt Windeln", uk: "Всього підгузків",
    };

    msg += `${childLabel}\n`;
    msg += `🤱 ${totalLabel[lang]}: <b>${feedings.length}</b> · ${avgLabel[lang]}: <b>${avgFeeds}</b>\n`;
    if (totalMs > 0) msg += `⏱ ${timeLabel[lang]}: <b>${formatMs(totalMs)}</b>\n`;
    if (bottleTotalMl > 0) msg += `🍼 Bottle total: <b>${bottleTotalMl} ml</b>\n`;
    msg += `💧 ${diaperTotalLabel[lang]}: <b>${diapers.length}</b> · ${avgLabel[lang]}: <b>${avgDiapers}</b>\n\n`;
  }

  return msg.trim();
}

// ─── /log command parser ─────────────────────────────────────────────────────
// Formats:
//   /log [DD.MM[.YYYY]] nica left 14:00-14:10 right 14:10-14:20
//   /log 19.03 nici right 15:00-15:12       → backfill March 19
//   /log nica both 14:00-15:00              → today, both breasts, split 50/50
//   /log both right 14:00-15:00             → both babies, right breast
//   /log both both 14:00-15:00              → both babies, both breasts, split 50/50
//   /log nica bottle 80                     → generic bottle
//   /log nica own 80                        → own milk bottle
//   /log nica other 80                      → other/formula milk bottle
//   /log nici right 14:00-15:00 own 15ml    → breast + own bottle in one entry
//   /log nici diaper wet
// Date prefix (optional): DD.MM or DD.MM.YYYY — defaults to today if omitted
// Child keywords: nica / nici / both (= both babies)
// Side keywords: left/links/ліво/l/li · right/rechts/право/r/re · both (= both breasts)
// Bottle keywords: bottle/flasche/b · own/eigen/expressed · other/andere/formula
// Diaper keywords: diaper/windel/підгузок/d/w

// Detect and parse an optional DD.MM or DD.MM.YYYY date prefix from the first arg
// Returns a Vienna-zoned Date (midnight Vienna time) for use with timeToMs
function parseDatePrefix(arg: string): Date | null {
  const match = arg.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (!match) return null;
  const day = parseInt(match[1]);
  const month = parseInt(match[2]) - 1; // JS months are 0-indexed
  const year = match[3] ? parseInt(match[3]) : fmtVienna(Date.now(), "yyyy").length === 4
    ? parseInt(fmtVienna(Date.now(), "yyyy"))
    : new Date().getFullYear();
  if (day < 1 || day > 31 || month < 0 || month > 11) return null;
  // Build a Vienna-local date at midnight
  const viennaToday = toVienna(Date.now());
  viennaToday.setFullYear(year, month, day);
  viennaToday.setHours(0, 0, 0, 0);
  return viennaToday;
}

const SIDE_LEFT = new Set(["left", "links", "ліво", "лівий", "l", "li", "le"]);
const SIDE_RIGHT = new Set(["right", "rechts", "право", "правий", "r", "re", "ri"]);
const SIDE_BOTH_BREAST = new Set(["both", "beide", "обидві", "обидва"]);
// Generic bottle (no milk type specified)
const SIDE_BOTTLE = new Set(["bottle", "flasche", "пляшечка", "b", "fl"]);
// Own milk bottle (expressed/pumped)
const SIDE_OWN = new Set(["own", "eigen", "eigene", "своє", "своя", "expressed", "pumped", "abgepumpt"]);
// Other/formula milk bottle
const SIDE_OTHER = new Set(["other", "andere", "anderes", "інше", "formula", "formule", "pre", "fremde"]);
const SIDE_DIAPER = new Set(["diaper", "windel", "підгузок", "d", "w"]);

const DIAPER_TYPE_MAP: Record<string, "wet" | "dirty" | "both"> = {
  wet: "wet", nass: "wet", мокра: "wet", мокрий: "wet",
  dirty: "dirty", schmutzig: "dirty", брудна: "dirty", брудний: "dirty",
  both: "both", beides: "both", обидва: "both",
};

// Resolve child arg: returns array of children to log for
function resolveChildren(raw: string): Array<"nica" | "nici"> | null {
  const lower = raw.toLowerCase();
  if (lower === "nica") return ["nica"];
  if (lower === "nici") return ["nici"];
  if (lower === "both" || lower === "beide" || lower === "обидві") return ["nica", "nici"];
  return null;
}

// Parse a time range and optionally split it 50/50 for both-breast mode
function parseTimeRange(rangeStr: string, now: Date): { start: number; end: number } | null {
  // Accept HH:MM-HH:MM, H:MM-H:MM, H-H, H:MM-H, H-H:MM (bare hours = :00)
  const match = rangeStr.match(/^(\d{1,2}(?::\d{2})?)-(\d{1,2}(?::\d{2})?)$/);
  if (!match) return null;
  const s = parseTime(match[1]);
  const e = parseTime(match[2]);
  if (!s || !e) return null;
  return { start: timeToMs(s.h, s.m, now), end: timeToMs(e.h, e.m, now) };
}

async function handleLog(args: string[], chatId: number, lang: Lang, fromVoice = false) {
  if (args.length < 2) {
    const usage: Record<Lang, string> = {
      en: `📝 <b>Usage:</b>\n🕒 <b>Quick-log</b> (time = now): <code>/log nica left</code> · <code>/log nici right</code> · <code>/log both left</code>\n🕐 <b>With time range</b>: <code>/log nica left 14:00-14:10 right 14:10-14:20</code>\n<code>/log 19.03 nici right 14:00-14:15</code> (backfill with date)\n<code>/log nici both 14:00-15:00</code> (both breasts, split 50/50)\n<code>/log nica own 80</code> (own milk) · <code>/log nica other 80</code> (formula)\n<code>/log nici right 14:00-15:00 own 15</code> (breast + bottle)\n<code>/log nici diaper wet</code>\n\n💡 Date prefix (DD.MM or DD.MM.YYYY) is optional — defaults to today.`,
      de: `📝 <b>Verwendung:</b>\n🕒 <b>Schnell-Log</b> (Zeit = jetzt): <code>/log nica links</code> · <code>/log nici rechts</code> · <code>/log beide links</code>\n🕐 <b>Mit Zeitbereich</b>: <code>/log nica links 14:00-14:10 rechts 14:10-14:20</code>\n<code>/log 19.03 nici rechts 14:00-14:15</code> (Datum angeben)\n<code>/log nici beide 14:00-15:00</code> (beide Brüste, 50/50)\n<code>/log nica eigen 80</code> (eigene Milch) · <code>/log nica andere 80</code> (Fremde)\n<code>/log nici windel nass</code>\n\n💡 Datum (TT.MM oder TT.MM.JJJJ) ist optional — Standard: heute.`,
      uk: `📝 <b>Використання:</b>\n🕒 <b>Швидкий запис</b> (час = зараз): <code>/log nica ліво</code> · <code>/log nici право</code> · <code>/log обидві ліво</code>\n🕐 <b>З часовим діапазоном</b>: <code>/log nica ліво 14:00-14:10 право 14:10-14:20</code>\n<code>/log 19.03 nici право 14:00-14:15</code> (з датою)\n<code>/log nici обидві 14:00-15:00</code> (обидві груди, 50/50)\n<code>/log nica своє 80</code> (своє молоко) · <code>/log nica інше 80</code> (суміш)\n<code>/log nici підгузок мокра</code>\n\n💡 Дата (ДД.ММ або ДД.ММ.РРРР) необов'язкова — за замовчуванням сьогодні.`,
    };
    return sendMessage(chatId, usage[lang]);
  }

  // Check for optional date prefix as first argument
  // baseDate must be a Vienna-zoned Date so timeToMs interprets HH:MM correctly
  let argOffset = 0;
  let baseDate = toVienna(Date.now()); // Vienna "now" as a local Date
  const dateParsed = parseDatePrefix(args[0]);
  if (dateParsed) {
    baseDate = dateParsed; // already Vienna-zoned midnight
    argOffset = 1;
  }

  const children = resolveChildren(args[argOffset]);
  if (!children) return sendMessage(chatId, t("unknownChild", lang));

  const db = await getDb();
  if (!db) return sendMessage(chatId, t("dbUnavailable", lang));

  const now = baseDate;
  // nowMs: the UTC timestamp to use for quick-log (point-in-time) entries.
  // For historical entries (date prefix given) we use noon Vienna time;
  // for real-time entries we use the actual current time.
  const isHistoricalEarly = argOffset === 1;
  const earlyEntryDate = new Date(baseDate);
  earlyEntryDate.setHours(12, 0, 0, 0);
  const nowMs = isHistoricalEarly ? fromVienna(earlyEntryDate) : Date.now();

  let leftStart: number | null = null;
  let leftEnd: number | null = null;
  let rightStart: number | null = null;
  let rightEnd: number | null = null;
  let bottleMl: number | null = null;
  let bottleType: "generic" | "own" | "other" = "generic";
  let isDiaper = false;
  let diaperType: "wet" | "dirty" | "both" | null = null;

  // Parse remaining args (start after date prefix + child name)
  let i = argOffset + 1;
  while (i < args.length) {
    const token = args[i].toLowerCase();

    if (SIDE_LEFT.has(token)) {
      const range = args[i + 1];
      const parsed = range ? parseTimeRange(range, now) : null;
      if (parsed) {
        leftStart = parsed.start; leftEnd = parsed.end; i += 2;
      } else {
        // Quick-log: no time range → point-in-time (start = now, end = start)
        leftStart = nowMs; leftEnd = nowMs; i++;
      }
      continue;
    } else if (SIDE_RIGHT.has(token)) {
      const range = args[i + 1];
      const parsed = range ? parseTimeRange(range, now) : null;
      if (parsed) {
        rightStart = parsed.start; rightEnd = parsed.end; i += 2;
      } else {
        rightStart = nowMs; rightEnd = nowMs; i++;
      }
      continue;
    } else if (SIDE_BOTH_BREAST.has(token)) {
      // Both breasts: parse total range, split 50/50 — or quick-log both at once
      const range = args[i + 1];
      const parsed = range ? parseTimeRange(range, now) : null;
      if (parsed) {
        const half = Math.floor((parsed.end - parsed.start) / 2);
        leftStart = parsed.start;
        leftEnd = parsed.start + half;
        rightStart = parsed.start + half;
        rightEnd = parsed.end;
        i += 2;
      } else {
        // Quick-log both breasts at current time
        leftStart = nowMs; leftEnd = nowMs;
        rightStart = nowMs; rightEnd = nowMs;
        i++;
      }
      continue;
    } else if (SIDE_OWN.has(token)) {
      const nextToken = args[i + 1] || "";
      const isTimeRange = /^\d{1,2}:\d{2}/.test(nextToken); // e.g. 19:25-19:30
      const mlStr = nextToken.replace(/ml$/i, "");
      const ml = !isTimeRange ? parseInt(mlStr) : NaN;
      bottleMl = !isNaN(ml) && ml > 0 ? ml : -1;
      bottleType = "own";
      i += (!isNaN(ml) && ml > 0) ? 2 : 1;
      continue;
    } else if (SIDE_OTHER.has(token)) {
      const nextToken = args[i + 1] || "";
      const isTimeRange = /^\d{1,2}:\d{2}/.test(nextToken);
      const mlStr = nextToken.replace(/ml$/i, "");
      const ml = !isTimeRange ? parseInt(mlStr) : NaN;
      bottleMl = !isNaN(ml) && ml > 0 ? ml : -1;
      bottleType = "other";
      i += (!isNaN(ml) && ml > 0) ? 2 : 1;
      continue;
    } else if (SIDE_BOTTLE.has(token)) {
      const nextToken = args[i + 1] || "";
      const isTimeRange = /^\d{1,2}:\d{2}/.test(nextToken);
      const mlStr = nextToken.replace(/ml$/i, "");
      const ml = !isTimeRange ? parseInt(mlStr) : NaN;
      if (!isNaN(ml) && ml > 0) {
        bottleMl = ml;
        i += 2;
        continue;
      } else {
        bottleMl = -1;
        i++;
        continue;
      }
    } else if (token === "vitd" || token === "vitamind" || token === "vitamin" || token === "vit") {
      // Vitamin D log — handle immediately and return
      const isHistoricalVitD = argOffset === 1;
      const vitDDate = new Date(baseDate);
      vitDDate.setHours(9, 0, 0, 0); // default to 9:00 Vienna time
      const givenAt = isHistoricalVitD ? fromVienna(vitDDate) : Date.now();
      const vitDDateLabel = isHistoricalVitD ? ` (${fmtVienna(givenAt, "dd.MM.yyyy")})` : "";
      const voiceTagVitD = fromVoice ? " 🎙" : "";
      const { insertVitaminDLog } = await import("./db");
      for (const child of children) {
        await insertVitaminDLog({ child, givenAt, notes: "via bot", loggedBy: null, createdAt: Date.now() });
      }
      const childDisplayVitD = children.length > 1 ? "Nica & Nici" : (children[0] === "nica" ? "Nica" : "Nici");
      const vitDDone: Record<Lang, string> = {
        en: `✅ 💊 Vitamin D logged for <b>${childDisplayVitD}</b>${vitDDateLabel}!${voiceTagVitD}`,
        de: `✅ 💊 Vitamin D für <b>${childDisplayVitD}</b>${vitDDateLabel} eingetragen!${voiceTagVitD}`,
        uk: `✅ 💊 Вітамін D для <b>${childDisplayVitD}</b>${vitDDateLabel} записано!${voiceTagVitD}`,
      };
      return sendMessage(chatId, vitDDone[lang]);
    } else if (SIDE_DIAPER.has(token)) {
      isDiaper = true;
      const typeToken = (args[i + 1] || "").toLowerCase();
      diaperType = DIAPER_TYPE_MAP[typeToken] || null;
      i += diaperType ? 2 : 1;
      continue;
    }
    i++;
  }

  // Use baseDate noon (Vienna) as the createdAt timestamp for historical entries
  // This ensures entries appear on the correct day in analytics
  const isHistorical = argOffset === 1; // date prefix was provided
  const entryDate = new Date(baseDate); // baseDate is already Vienna-zoned
  entryDate.setHours(12, 0, 0, 0); // noon Vienna time
  const createdAt = isHistorical ? fromVienna(entryDate) : Date.now();
  const dateLabel = isHistorical ? ` (${fmtVienna(createdAt, "dd.MM.yyyy")})` : "";

  // Handle diaper (for each child)
  if (isDiaper) {
    const type = diaperType || "wet";
    const icons: Record<string, string> = { wet: "💧", dirty: "💩", both: "🔄" };
    const typeLabels: Record<Lang, Record<string, string>> = {
      en: { wet: "wet", dirty: "dirty", both: "both" },
      de: { wet: "nass", dirty: "schmutzig", both: "beides" },
      uk: { wet: "мокра", dirty: "брудна", both: "обидва" },
    };
    for (const child of children) {
      await insertDiaperChange({ child, type, notes: "via bot", loggedBy: null, changedAt: createdAt, createdAt });
    }
    const childDisplay = children.length > 1 ? "Nica & Nici" : (children[0] === "nica" ? "Nica" : "Nici");
    const doneLabels: Record<Lang, string> = {
      en: `✅ ${icons[type]} Diaper logged for <b>${childDisplay}</b>: <b>${typeLabels[lang][type]}</b>${dateLabel}`,
      de: `✅ ${icons[type]} Windel für <b>${childDisplay}</b> eingetragen: <b>${typeLabels[lang][type]}</b>${dateLabel}`,
      uk: `✅ ${icons[type]} Підгузок для <b>${childDisplay}</b> записанно: <b>${typeLabels[lang][type]}</b>${dateLabel}`,
    };
    return sendMessage(chatId, doneLabels[lang]);
  }

  // Handle feeding — also allow quick-log (no time range, just side keyword)
  if (!leftStart && !rightStart && bottleMl === null) {
    const errLabels: Record<Lang, string> = {
      en: `❌ Could not parse. Example: <code>/log nica left</code> or <code>/log nica left 14:00-14:10</code>`,
      de: `❌ Konnte nicht lesen. Beispiel: <code>/log nica links</code> oder <code>/log nica links 14:00-14:10</code>`,
      uk: `❌ Не вдалося розпізнати. Приклад: <code>/log nica ліво</code> або <code>/log nica ліво 14:00-14:10</code>`,
    };
    return sendMessage(chatId, errLabels[lang]);
  }

  const actualBottleMl = bottleMl === -1 ? null : bottleMl;
  const confirmParts: string[] = [];

  // For quick-log (start === end, zero duration), show the time instead of "0m"
  const isQuickLeft = leftStart !== null && leftStart === leftEnd;
  const isQuickRight = rightStart !== null && rightStart === rightEnd;
  if (leftStart && leftEnd) {
    const label = isQuickLeft
      ? `👈 Left: <b>${fmtVienna(leftStart, "HH:mm")}</b>`
      : `👈 Left: <b>${formatMs(leftEnd - leftStart)}</b>`;
    confirmParts.push(label);
  }
  if (rightStart && rightEnd) {
    const label = isQuickRight
      ? `👉 Right: <b>${fmtVienna(rightStart, "HH:mm")}</b>`
      : `👉 Right: <b>${formatMs(rightEnd - rightStart)}</b>`;
    confirmParts.push(label);
  }
  if (bottleMl && bottleMl > 0) {
    const bottleIcon = bottleType === "own" ? "🍼👩" : bottleType === "other" ? "🍼🥛" : "🍼";
    const bottleLabel = bottleType === "own" ? "Own milk" : bottleType === "other" ? "Formula" : "Bottle";
    confirmParts.push(`${bottleIcon} ${bottleLabel}: <b>${bottleMl} ml</b>`);
  }
  if (bottleMl === -1) confirmParts.push(`🍼 Bottle: <b>tbd</b>`);

  // Insert for each child (using withRetry-wrapped helper to survive ECONNRESET)
  for (const child of children) {
    await insertFeedingSession({
      child,
      leftStart,
      leftEnd,
      rightStart,
      rightEnd,
      bottleMl: actualBottleMl,
      notes: `via bot${bottleType !== "generic" ? ` (${bottleType})` : ""}`,
      loggedBy: null,
      createdAt,
    });
  }

  const childDisplay = children.length > 1 ? "Nica & Nici" : (children[0] === "nica" ? "Nica" : "Nici");
  const voiceTag = fromVoice ? " 🎙" : "";
  const doneLabels: Record<Lang, string> = {
    en: `✅ Feeding logged for <b>${childDisplay}</b>${dateLabel}!${voiceTag}\n${confirmParts.join(" · ")}`,
    de: `✅ Stillen für <b>${childDisplay}</b>${dateLabel} eingetragen!${voiceTag}\n${confirmParts.join(" · ")}`,
    uk: `✅ Годування для <b>${childDisplay}</b>${dateLabel} записано!${voiceTag}\n${confirmParts.join(" · ")}`,
  };
  await sendMessage(chatId, doneLabels[lang]);
}

// ─── /delete command ─────────────────────────────────────────────────────────

async function handleDelete(args: string[], chatId: number, lang: Lang, _fromVoice = false) {
  const childArg = args[0]?.toLowerCase();
  const children: ("nica" | "nici")[] =
    childArg === "both" || childArg === "beide" || childArg === "обидві"
      ? ["nica", "nici"]
      : childArg === "nica" ? ["nica"]
      : childArg === "nici" ? ["nici"]
      : [];

  if (children.length === 0) {
    const usage: Record<Lang, string> = {
      en: "❌ Usage: <code>/delete nica</code> · <code>/delete nici</code> · <code>/delete both</code>\nDeletes the last feeding or diaper entry for the specified child.",
      de: "❌ Nutzung: <code>/delete nica</code> · <code>/delete nici</code> · <code>/delete beide</code>\nLöscht den letzten Eintrag (Stillen oder Windel) für das angegebene Kind.",
      uk: "❌ Використання: <code>/delete nica</code> · <code>/delete nici</code> · <code>/delete обидві</code>\nВидаляє останній запис (годування або підгузок) для вказаної дитини.",
    };
    return sendMessage(chatId, usage[lang]);
  }

  const results: string[] = [];

  for (const child of children) {
    const childLabel = child === "nica" ? "👧 Nica" : "👶 Nici";

    // Try to delete last feeding first, then last diaper
    const feeding = await deleteLastFeedingSession(child).catch(() => null);
    if (feeding) {
      const timeStr = fmtVienna(feeding.createdAt, "HH:mm dd.MM.yyyy");
      const parts: string[] = [];
      if (feeding.leftStart && feeding.leftEnd) parts.push(`L ${formatMs(feeding.leftEnd - feeding.leftStart)}`);
      if (feeding.rightStart && feeding.rightEnd) parts.push(`R ${formatMs(feeding.rightEnd - feeding.rightStart)}`);
      if (feeding.bottleMl) parts.push(`🍼 ${feeding.bottleMl}ml`);
      const detail = parts.length > 0 ? ` (${parts.join(" · ")})` : "";
      const deletedLabels: Record<Lang, string> = {
        en: `🗑 ${childLabel}: Feeding deleted${detail} — ${timeStr}`,
        de: `🗑 ${childLabel}: Stilleintrag gelöscht${detail} — ${timeStr}`,
        uk: `🗑 ${childLabel}: Запис годування видалено${detail} — ${timeStr}`,
      };
      results.push(deletedLabels[lang]);
      continue;
    }

    const diaper = await deleteLastDiaperChange(child).catch(() => null);
    if (diaper) {
      const timeStr = fmtVienna(diaper.changedAt, "HH:mm dd.MM.yyyy");
      const typeLabels: Record<string, Record<Lang, string>> = {
        wet:   { en: "Wet 💧",   de: "Nass 💧",       uk: "Мокрий 💧" },
        dirty: { en: "Dirty 💩", de: "Schmutzig 💩",  uk: "Брудний 💩" },
        both:  { en: "Both 💧💩", de: "Beides 💧💩",   uk: "Обидва 💧💩" },
      };
      const typeLabel = typeLabels[diaper.type]?.[lang] ?? diaper.type;
      const deletedLabels: Record<Lang, string> = {
        en: `🗑 ${childLabel}: Diaper deleted (${typeLabel}) — ${timeStr}`,
        de: `🗑 ${childLabel}: Windeleintrag gelöscht (${typeLabel}) — ${timeStr}`,
        uk: `🗑 ${childLabel}: Запис підгузка видалено (${typeLabel}) — ${timeStr}`,
      };
      results.push(deletedLabels[lang]);
      continue;
    }

    const nothingLabels: Record<Lang, string> = {
      en: `ℹ️ ${childLabel}: No entries found to delete.`,
      de: `ℹ️ ${childLabel}: Keine Einträge zum Löschen gefunden.`,
      uk: `ℹ️ ${childLabel}: Записів для видалення не знайдено.`,
    };
    results.push(nothingLabels[lang]);
  }

  await sendMessage(chatId, results.join("\n"));
}

// ─── Analytics commands ──────────────────────────────────────────────────────

async function handleToday(chatId: number, lang: Lang) {
  const summary = await buildDailySummary(Date.now(), lang);
  await sendMessage(chatId, summary, analyticsButton(lang));
}

async function handleWeek(chatId: number, lang: Lang) {
  const summary = await buildWeeklySummary(lang);
  await sendMessage(chatId, summary, analyticsButton(lang));
}

async function handleSummary(args: string[], chatId: number, lang: Lang) {
  // Default to Vienna "today"
  let targetMs = Date.now();
  if (args.length > 0) {
    const parsed = parseDatePrefix(args[0]);
    if (parsed) {
      // parsed is a Vienna-zoned midnight — convert to UTC ms
      targetMs = fromVienna(parsed);
    }
  }
  const summary = await buildDailySummary(targetMs, lang);
  await sendMessage(chatId, summary, analyticsButton(lang));
}

async function handleLast(args: string[], chatId: number, lang: Lang) {
  // Optional child filter: /last nica or /last nici (default: both)
  const childArg = args[0]?.toLowerCase();
  const children: ("nica" | "nici")[] =
    childArg === "nica" ? ["nica"]
    : childArg === "nici" ? ["nici"]
    : ["nica", "nici"];

  const headers: Record<Lang, string> = {
    en: "🕐 <b>Last status</b>",
    de: "🕐 <b>Letzter Status</b>",
    uk: "🕐 <b>Останній статус</b>",
  };
  const noFeedingLabels: Record<Lang, string> = {
    en: "No feedings recorded",
    de: "Keine Mahlzeiten",
    uk: "Немає годувань",
  };
  const noDiaperLabels: Record<Lang, string> = {
    en: "No diapers recorded",
    de: "Keine Windeln",
    uk: "Немає підгузків",
  };
  const agoLabels: Record<Lang, string> = {
    en: "ago",
    de: "vor",
    uk: "тому",
  };
  const feedingLabel: Record<Lang, string> = {
    en: "🤱 Last feeding",
    de: "🤱 Letzte Mahlzeit",
    uk: "🤱 Останнє годування",
  };
  const diaperLabel: Record<Lang, string> = {
    en: "💧 Last diaper",
    de: "💧 Letzte Windel",
    uk: "💧 Останній підгузок",
  };

  let msg = `${headers[lang]}\n\n`;

  for (const child of children) {
    const childLabel = child === "nica" ? "👧 <b>Nica</b>" : "👶 <b>Nici</b>";
    msg += `${childLabel}\n`;

    // ── Last feeding (withRetry-wrapped helper) ──
    const lastFeed = await getLastFeedingSession(child);

    if (!lastFeed) {
      msg += `${feedingLabel[lang]}: ${noFeedingLabels[lang]}\n`;
    } else {
      const ago = Date.now() - lastFeed.createdAt;
      const timeStr = fmtVienna(lastFeed.createdAt, "HH:mm");
      const parts: string[] = [];
      if (lastFeed.leftStart && lastFeed.leftEnd) parts.push(`👈 ${formatMs(lastFeed.leftEnd - lastFeed.leftStart)}`);
      if (lastFeed.rightStart && lastFeed.rightEnd) parts.push(`👉 ${formatMs(lastFeed.rightEnd - lastFeed.rightStart)}`);
      if (lastFeed.bottleMl) {
        const notes = lastFeed.notes || "";
        const bottleIcon = notes.includes("own") ? "🍼👩" : notes.includes("other") ? "🍼🥛" : "🍼";
        parts.push(`${bottleIcon} ${lastFeed.bottleMl} ml`);
      }
      const detail = parts.length > 0 ? ` (${parts.join(" · ")})` : "";
      msg += `${feedingLabel[lang]}: <b>${timeStr}</b>${detail} — <b>${formatMs(ago)} ${agoLabels[lang]}</b>\n`;
    }

    // ── Last diaper (withRetry-wrapped helper) ──
    const lastDiaper = await getLastDiaperChange(child);

    if (!lastDiaper) {
      msg += `${diaperLabel[lang]}: ${noDiaperLabels[lang]}\n`;
    } else {
      const diaperAgo = Date.now() - lastDiaper.changedAt;
      const diaperTimeStr = fmtVienna(lastDiaper.changedAt, "HH:mm");
      const typeIcons: Record<string, string> = { wet: "💧", dirty: "💩", both: "💧💩" };
      const icon = typeIcons[lastDiaper.type] ?? "";
      msg += `${diaperLabel[lang]}: <b>${diaperTimeStr}</b> ${icon} — <b>${formatMs(diaperAgo)} ${agoLabels[lang]}</b>\n`;
    }

    msg += "\n";
  }

  await sendMessage(chatId, msg.trim());
}

async function handleHelp(chatId: number, lang: Lang) {
  const texts: Record<Lang, string> = {
    en: `🍼 <b>Baby Tracker — Commands</b>

<b>⚡ Quick-log</b> (records current time instantly):
<code>/log nica left</code> · <code>/log nici right</code> · <code>/log both left</code>
<code>/log nica bottle</code> · <code>/log nica own 65</code> (with ml)
<code>/log nica diaper wet</code> · <code>/log both vitd</code>

<b>Breast feeding with time range:</b>
<code>/log nica left 14:00-14:10 right 14:10-14:20</code>
<code>/log 19.03 nici right 14:00-14:15</code> — backfill with DD.MM date
<code>/log nici both 14:00-15:00</code> — both breasts, time split 50/50
<code>/log both right 14:00-15:00</code> — both babies at once
<code>/log both both 14:00-15:00</code> — both babies, both breasts

<b>Bottle feeding:</b>
<code>/log nica own 80</code> — own milk (80 ml)
<code>/log nica other 80</code> — formula/other milk (80 ml)
<code>/log nica bottle 80</code> — generic bottle
<code>/log nici right 14:00-15:00 own 15</code> — breast + own milk

<b>Diaper:</b>
<code>/log nica diaper wet</code> · <code>dirty</code> · <code>both</code>

<b>Vitamin D:</b>
<code>/log nica vitd</code> · <code>/log nici vitd</code> · <code>/log both vitd</code>

<b>Analytics:</b>
<code>/today</code> — today's summary
<code>/week</code> — last 7 days
<code>/summary 19.03</code> — specific date
<code>/last</code> — last feeding + diaper per child
<code>/last nica</code> · <code>/last nici</code> — filter by child

<b>Delete last entry:</b>
<code>/delete nica</code> · <code>/delete nici</code> · <code>/delete both</code>

<b>Reminders:</b>
<code>/snooze 2h</code> — silence reminders for 2 hours
<code>/snooze 30m</code> · <code>/snooze 1h30m</code> — custom duration
<code>/snooze off</code> — cancel snooze · <code>/snooze</code> — check status

<b>Settings &amp; Info:</b>
<code>/status</code> — DB status, last reminders &amp; snooze state
<code>/settings</code> — show current config &amp; open settings
<code>/version</code> — show version &amp; uptime`,

    de: `🍼 <b>Baby Tracker — Befehle</b>

<b>⚡ Schnell-Log</b> (erfasst aktuelle Uhrzeit sofort):
<code>/log nica links</code> · <code>/log nici rechts</code> · <code>/log beide links</code>
<code>/log nica flasche</code> · <code>/log nica eigen 65</code> (mit ml)
<code>/log nica windel nass</code> · <code>/log beide vitd</code>

<b>Stillen mit Zeitbereich:</b>
<code>/log nica links 14:00-14:10 rechts 14:10-14:20</code>
<code>/log 19.03 nici rechts 14:00-14:15</code> — Datum angeben (TT.MM)
<code>/log nici beide 14:00-15:00</code> — beide Brüste, 50/50 geteilt
<code>/log beide rechts 14:00-15:00</code> — beide Babys gleichzeitig
<code>/log beide beide 14:00-15:00</code> — beide Babys, beide Brüste

<b>Flasche:</b>
<code>/log nica eigen 80</code> — eigene Milch (80 ml)
<code>/log nica andere 80</code> — Fremdmilch/Formel (80 ml)
<code>/log nica flasche 80</code> — allgemeine Flasche
<code>/log nici rechts 14:00-15:00 eigen 15</code> — Stillen + eigene Milch

<b>Windel:</b>
<code>/log nica windel nass</code> · <code>schmutzig</code> · <code>beides</code>

<b>Vitamin D:</b>
<code>/log nica vitd</code> · <code>/log nici vitd</code> · <code>/log beide vitd</code>

<b>Analyse:</b>
<code>/today</code> — heutige Übersicht
<code>/week</code> — letzte 7 Tage
<code>/summary 19.03</code> — bestimmtes Datum
<code>/last</code> — letzte Mahlzeit + Windel je Kind
<code>/last nica</code> · <code>/last nici</code> — nur ein Kind

<b>Letzten Eintrag löschen:</b>
<code>/delete nica</code> · <code>/delete nici</code> · <code>/delete beide</code>

<b>Erinnerungen:</b>
<code>/snooze 2h</code> — Erinnerungen für 2 Stunden stummschalten
<code>/snooze 30m</code> · <code>/snooze 1h30m</code> — benutzerdefinierte Dauer
<code>/snooze off</code> — Snooze beenden · <code>/snooze</code> — Status prüfen

<b>Einstellungen &amp; Info:</b>
<code>/status</code> — DB-Status, letzte Erinnerungen &amp; Snooze-Zustand
<code>/settings</code> — aktuelle Konfiguration &amp; Einstellungen öffnen
<code>/version</code> — Version &amp; Laufzeit anzeigen`,

    uk: `🍼 <b>Baby Tracker — Команди</b>

<b>⚡ Швидкий запис</b> (записує поточний час миттєво):
<code>/log nica ліво</code> · <code>/log nici право</code> · <code>/log обидві ліво</code>
<code>/log nica пляшечка</code> · <code>/log nica своє 65</code> (з мл)
<code>/log nica підгузок мокра</code> · <code>/log обидві vitd</code>

<b>Грудне годування з часовим діапазоном:</b>
<code>/log nica ліво 14:00-14:10 право 14:10-14:20</code>
<code>/log 19.03 nici право 14:00-14:15</code> — з датою (ДД.ММ)
<code>/log nici обидві 14:00-15:00</code> — обидві груди, 50/50
<code>/log обидві право 14:00-15:00</code> — обидві дитини
<code>/log обидві обидві 14:00-15:00</code> — обидві дитини, обидві груди

<b>Пляшечка:</b>
<code>/log nica своє 80</code> — своє молоко (80 мл)
<code>/log nica інше 80</code> — суміш/інше молоко (80 мл)
<code>/log nica пляшечка 80</code> — звичайна пляшечка
<code>/log nici право 14:00-15:00 своє 15</code> — грудь + пляшечка

<b>Підгузок:</b>
<code>/log nica підгузок мокра</code> · <code>брудна</code> · <code>обидва</code>

<b>Вітамін D:</b>
<code>/log nica vitd</code> · <code>/log nici vitd</code> · <code>/log обидві vitd</code>

<b>Аналітика:</b>
<code>/today</code> — зведення за сьогодні
<code>/week</code> — останні 7 днів
<code>/summary 19.03</code> — конкретна дата
<code>/last</code> — останнє годування + підгузок
<code>/last nica</code> · <code>/last nici</code> — для однієї дитини

<b>Видалити останній запис:</b>
<code>/delete nica</code> · <code>/delete nici</code> · <code>/delete обидві</code>

<b>Нагадування:</b>
<code>/snooze 2h</code> — вимкнути нагадування на 2 години
<code>/snooze 30m</code> · <code>/snooze 1h30m</code> — довільна тривалість
<code>/snooze off</code> — скасувати · <code>/snooze</code> — перевірити статус

<b>Налаштування &amp; Інфо:</b>
<code>/status</code> — статус БД, останні нагадування &amp; снуз
<code>/settings</code> — поточна конфігурація &amp; відкрити налаштування
<code>/version</code> — показати версію &amp; час роботи`,
  };

  await sendMessage(chatId, texts[lang], analyticsButton(lang));
}

// ─── /status command ────────────────────────────────────────────────────────────────

async function handleStatus(chatId: number, lang: Lang) {
  const { readFileSync } = await import("fs");
  const { fileURLToPath } = await import("url");
  const { dirname, join } = await import("path");
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Version
  let version = "unknown";
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as { version: string };
    version = pkg.version;
  } catch { /* ignore */ }

  // Uptime
  const uptimeMs = Date.now() - SERVER_START_MS;
  const uptimeH = Math.floor(uptimeMs / 3_600_000);
  const uptimeM = Math.floor((uptimeMs % 3_600_000) / 60_000);
  const uptimeStr = uptimeH > 0 ? `${uptimeH}h ${uptimeM}m` : `${uptimeM}m`;

  // DB connectivity
  let dbOk = false;
  try {
    const db = await getDb();
    dbOk = db !== null;
  } catch { /* ignore */ }
  const dbIcon = dbOk ? "✅" : "❌";

  // Snooze state
  const snoozeRemaining = getSnoozeRemaining();
  const snoozeH = Math.floor(snoozeRemaining / 3_600_000);
  const snoozeM = Math.floor((snoozeRemaining % 3_600_000) / 60_000);
  const snoozeStr = snoozeRemaining > 0
    ? (snoozeH > 0 ? `${snoozeH}h ${snoozeM}m` : `${snoozeM}m`)
    : null;

  // Last reminder sent per child
  function fmtReminder(child: string): string {
    const ts = getLastReminderSent(child);
    if (!ts) return lang === "de" ? "noch nie" : lang === "uk" ? "ніколи" : "never";
    const elapsed = Date.now() - ts;
    const h = Math.floor(elapsed / 3_600_000);
    const m = Math.floor((elapsed % 3_600_000) / 60_000);
    const timeStr = fmtVienna(ts, "HH:mm");
    const agoStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return lang === "de" ? `${timeStr} (vor ${agoStr})` :
           lang === "uk" ? `${timeStr} (${agoStr} тому)` :
           `${timeStr} (${agoStr} ago)`;
  }

  const nicaReminder = fmtReminder("nica");
  const niciReminder = fmtReminder("nici");

  const snoozeLineEn = snoozeStr ? `🔕 Reminders snoozed for <b>${snoozeStr}</b>` : `🔔 Reminders active`;
  const snoozeLineDe = snoozeStr ? `🔕 Erinnerungen noch <b>${snoozeStr}</b> stummgeschaltet` : `🔔 Erinnerungen aktiv`;
  const snoozeLineUk = snoozeStr ? `🔕 Нагадування вимкнені ще на <b>${snoozeStr}</b>` : `🔔 Нагадування активні`;

  const texts: Record<Lang, string> = {
    en: [
      `📊 <b>Baby Tracker v${version} — Status</b>`,
      ``,
      `${dbIcon} Database: <b>${dbOk ? "connected" : "unreachable"}</b>`,
      `⏱ Uptime: <b>${uptimeStr}</b>`,
      ``,
      `🔔 <b>Last reminders sent:</b>`,
      `  👧 Nica: <b>${nicaReminder}</b>`,
      `  👶 Nici: <b>${niciReminder}</b>`,
      ``,
      snoozeLineEn,
    ].join("\n"),
    de: [
      `📊 <b>Baby Tracker v${version} — Status</b>`,
      ``,
      `${dbIcon} Datenbank: <b>${dbOk ? "verbunden" : "nicht erreichbar"}</b>`,
      `⏱ Laufzeit: <b>${uptimeStr}</b>`,
      ``,
      `🔔 <b>Letzte Erinnerungen:</b>`,
      `  👧 Nica: <b>${nicaReminder}</b>`,
      `  👶 Nici: <b>${niciReminder}</b>`,
      ``,
      snoozeLineDe,
    ].join("\n"),
    uk: [
      `📊 <b>Baby Tracker v${version} — Статус</b>`,
      ``,
      `${dbIcon} База даних: <b>${dbOk ? "підключена" : "недоступна"}</b>`,
      `⏱ Час роботи: <b>${uptimeStr}</b>`,
      ``,
      `🔔 <b>Останні нагадування:</b>`,
      `  👧 Nica: <b>${nicaReminder}</b>`,
      `  👶 Nici: <b>${niciReminder}</b>`,
      ``,
      snoozeLineUk,
    ].join("\n"),
  };

  await sendMessage(chatId, texts[lang]);
}

// ─── /version command ───────────────────────────────────────────────────────────────

async function handleVersion(chatId: number, lang: Lang) {
  const { readFileSync } = await import("fs");
  const { fileURLToPath } = await import("url");
  const { dirname, join } = await import("path");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  let version = "unknown";
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as { version: string };
    version = pkg.version;
  } catch { /* ignore */ }

  const uptimeMs = Date.now() - SERVER_START_MS;
  const uptimeH = Math.floor(uptimeMs / 3_600_000);
  const uptimeM = Math.floor((uptimeMs % 3_600_000) / 60_000);
  const uptimeStr = uptimeH > 0 ? `${uptimeH}h ${uptimeM}m` : `${uptimeM}m`;
  const buildDate = fmtVienna(Date.now(), "dd.MM.yyyy");

  const texts: Record<Lang, string> = {
    en: `ℹ️ <b>Baby Tracker v${version}</b>\n\n📅 Build date: <b>${buildDate}</b>\n⏱ Uptime: <b>${uptimeStr}</b>`,
    de: `ℹ️ <b>Baby Tracker v${version}</b>\n\n📅 Build-Datum: <b>${buildDate}</b>\n⏱ Laufzeit: <b>${uptimeStr}</b>`,
    uk: `ℹ️ <b>Baby Tracker v${version}</b>\n\n📅 Дата збірки: <b>${buildDate}</b>\n⏱ Час роботи: <b>${uptimeStr}</b>`,
  };

  await sendMessage(chatId, texts[lang]);
}

// ─── /snooze command ─────────────────────────────────────────────────────────

async function handleSnooze(args: string[], chatId: number, lang: Lang) {
  const arg = (args[0] ?? "").toLowerCase().trim();

  // /snooze off — cancel active snooze
  if (arg === "off" || arg === "aus" || arg === "вимк") {
    clearSnooze();
    const msg = {
      en: "✅ Snooze cancelled — feeding reminders are active again.",
      de: "✅ Snooze beendet — Erinnerungen sind wieder aktiv.",
      uk: "✅ Снуз скасовано — нагадування знову активні.",
    };
    return sendMessage(chatId, msg[lang]);
  }

  // /snooze (no args) — show current status
  if (!arg) {
    const remaining = getSnoozeRemaining();
    if (remaining <= 0) {
      const msg = {
        en: "🔔 Reminders are active. Use <code>/snooze 2h</code> or <code>/snooze 30m</code> to silence.",
        de: "🔔 Erinnerungen sind aktiv. Nutze <code>/snooze 2h</code> oder <code>/snooze 30m</code> zum Stummschalten.",
        uk: "🔔 Нагадування активні. Використай <code>/snooze 2h</code> або <code>/snooze 30m</code> для вимкнення.",
      };
      return sendMessage(chatId, msg[lang]);
    }
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    const msg = {
      en: `🔕 Reminders snoozed for <b>${timeStr}</b> more. Use <code>/snooze off</code> to cancel.`,
      de: `🔕 Erinnerungen noch <b>${timeStr}</b> stummgeschaltet. <code>/snooze off</code> zum Beenden.`,
      uk: `🔕 Нагадування вимкнені ще на <b>${timeStr}</b>. <code>/snooze off</code> — скасувати.`,
    };
    return sendMessage(chatId, msg[lang]);
  }

  // Parse duration: 2h, 30m, 1h30m, 90m, etc.
  const durationMatch = arg.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (!durationMatch || (!durationMatch[1] && !durationMatch[2])) {
    const msg = {
      en: "❌ Usage: <code>/snooze 2h</code> · <code>/snooze 30m</code> · <code>/snooze 1h30m</code> · <code>/snooze off</code>",
      de: "❌ Nutzung: <code>/snooze 2h</code> · <code>/snooze 30m</code> · <code>/snooze 1h30m</code> · <code>/snooze off</code>",
      uk: "❌ Використання: <code>/snooze 2h</code> · <code>/snooze 30m</code> · <code>/snooze 1h30m</code> · <code>/snooze off</code>",
    };
    return sendMessage(chatId, msg[lang]);
  }

  const hours = parseInt(durationMatch[1] ?? "0");
  const minutes = parseInt(durationMatch[2] ?? "0");
  const durationMs = (hours * 60 + minutes) * 60 * 1000;

  if (durationMs <= 0) {
    const msg = {
      en: "❌ Duration must be greater than 0. Example: <code>/snooze 2h</code>",
      de: "❌ Dauer muss größer als 0 sein. Beispiel: <code>/snooze 2h</code>",
      uk: "❌ Тривалість має бути більше 0. Приклад: <code>/snooze 2h</code>",
    };
    return sendMessage(chatId, msg[lang]);
  }

  setSnooze(Date.now() + durationMs);

  const timeStr = hours > 0 && minutes > 0 ? `${hours}h ${minutes}m` : hours > 0 ? `${hours}h` : `${minutes}m`;
  const msg = {
    en: `🔕 Feeding reminders snoozed for <b>${timeStr}</b>.\nUse <code>/snooze off</code> to cancel early.`,
    de: `🔕 Erinnerungen für <b>${timeStr}</b> stummgeschaltet.\n<code>/snooze off</code> zum vorzeitigen Beenden.`,
    uk: `🔕 Нагадування вимкнені на <b>${timeStr}</b>.\n<code>/snooze off</code> — скасувати достроково.`,
  };
  return sendMessage(chatId, msg[lang]);
}

// ─── /settings command ───────────────────────────────────────────────────────────────

async function handleSettings(chatId: number, lang: Lang) {
  const { getTelegramSettings } = await import("./db");
  const settings = await getTelegramSettings().catch(() => null);

  const settingsUrl = `${APP_URL}/settings`;

  const enabledLabel = settings?.enabled ? "✅ Enabled" : "❌ Disabled";
  const digestLabel = settings?.digestTime ?? "21:00";

  const texts: Record<Lang, string> = {
    en: [
      `⚙️ <b>Baby Tracker — Settings</b>`,
      ``,
      `📊 Daily digest: <b>${digestLabel}</b>`,
      `🔔 Notifications: <b>${enabledLabel}</b>`,
      ``,
      `Open the dashboard to change all settings:`,
    ].join("\n"),
    de: [
      `⚙️ <b>Baby Tracker — Einstellungen</b>`,
      ``,
      `📊 Tägliche Übersicht: <b>${digestLabel}</b>`,
      `🔔 Benachrichtigungen: <b>${enabledLabel}</b>`,
      ``,
      `Öffne das Dashboard um alle Einstellungen zu ändern:`,
    ].join("\n"),
    uk: [
      `⚙️ <b>Baby Tracker — Налаштування</b>`,
      ``,
      `📊 Щоденний звіт: <b>${digestLabel}</b>`,
      `🔔 Сповіщення: <b>${enabledLabel}</b>`,
      ``,
      `Відкрий дашборд для зміни налаштувань:`,
    ].join("\n"),
  };

  const settingsBtnLabel: Record<Lang, string> = {
    en: "⚙️ Open Settings",
    de: "⚙️ Einstellungen öffnen",
    uk: "⚙️ Відкрити налаштування",
  };

  await sendMessage(chatId, texts[lang], {
    reply_markup: {
      inline_keyboard: [[
        { text: settingsBtnLabel[lang], url: settingsUrl },
      ]],
    },
  });
}

// ─── Voice fuzzy-match normalization ─────────────────────────────────────────

/**
 * Normalize common Whisper mis-transcriptions for baby tracker commands.
 * Handles EN/DE/UK variants and phonetic near-misses.
 */
export function normalizeVoiceTranscription(raw: string): string {
  let s = raw.trim().toLowerCase();

  // Remove leading slash if present (we'll add it back)
  const hadSlash = s.startsWith("/");
  if (hadSlash) s = s.slice(1);

  // ── Strip trailing punctuation that Whisper always adds ─────────────────────────
  // Whisper transcribes "Last" as "Last." and "Log nica left 9 to 9:30" as
  // "Log nica left 9 to 9:30." — strip the trailing period/punctuation first.
  s = s.replace(/[.!?,;]+$/, "");

  // ── Command word fixes ──────────────────────────────────────────────────────
  // log: lock, lok, log, lug, lag, lop, loch, lok, logg, logs
  s = s.replace(/^(lock|lok|lug|lag|lop|loch|logg|logs|loge|log)\b/, "log");
  // delete: delet, deleat, dileet, delete
  s = s.replace(/^(delet|deleat|dileet|deletee)\b/, "delete");
  // today: to day, to-day, heute
  s = s.replace(/^(to day|to-day|heute)\b/, "today");
  // last: lust, las, lest, letzte, letzter, letztes
  s = s.replace(/^(lust|las|lest|letzte[rs]?)\b/, "last");
  // week: wick, wik, woche
  s = s.replace(/^(wick|wik|woche)\b/, "week");
  // summary: sumary, summery, somary
  s = s.replace(/^(sumary|summery|somary|sumery)\b/, "summary");
  // version: vershion, verson
  s = s.replace(/^(vershion|verson)\b/, "version");
  // settings: seetings, setings, einstellungen
  s = s.replace(/^(seetings|setings|einstellungen)\b/, "settings");
  // help: hilfe, допомога
  s = s.replace(/^(hilfe|допомога)\b/, "help");

  // ── Natural-language shortcuts (no slash needed) ────────────────────────────
  // "status" / "what's the status" → last
  if (/^(status|what'?s? the status|show status)/.test(s)) s = "last";
  // bare "today" / "сьогодні" → today (DE/UK already handled above)
  if (/^(today|сьогодні)$/.test(s)) s = "today";
  // bare "last" / "останнє" → last (DE already handled above)
  if (/^(last|останнє|останній)$/.test(s)) s = "last";
  // bare "week" / "тиждень" → week (DE already handled above)
  if (/^(week|тиждень)$/.test(s)) s = "week";
  // bare "help" → help
  if (/^help$/.test(s)) s = "help";

  // ── Argument word fixes ─────────────────────────────────────────────────────
  // child names: nica/nici variants
  s = s.replace(/\bnika\b/g, "nica");
  s = s.replace(/\bnicky\b/g, "nici");
  // diaper: diary, diaper, nappy, windel, підгузок
  s = s.replace(/\b(diary|diper|diapper|nappy)\b/g, "diaper");
  // wet: whet, wett
  s = s.replace(/\b(whet|wett)\b/g, "wet");
  // dirty: durty, dirtee
  s = s.replace(/\b(durty|dirtee)\b/g, "dirty");
  // left: lef, lft
  s = s.replace(/\b(lef|lft)\b/g, "left");
  // right: rite, righ
  s = s.replace(/\b(rite|righ)\b/g, "right");
  // both: bot, bott
  s = s.replace(/\b(bot|bott)\b/g, "both");
  // own: oun, owne
  s = s.replace(/\b(oun|owne)\b/g, "own");
  // bottle: bottel, botle
  s = s.replace(/\b(bottel|botle)\b/g, "bottle");

  // ── Spoken number words → digits ────────────────────────────────────────────
  // EN: zero–twelve (covers all hours 0–12 and minutes like "thirty", "forty-five")
  const EN_NUMS: [RegExp, string][] = [
    [/\bzero\b/g, "0"], [/\bone\b/g, "1"], [/\btwo\b/g, "2"],
    [/\bthree\b/g, "3"], [/\bfour\b/g, "4"], [/\bfive\b/g, "5"],
    [/\bsix\b/g, "6"], [/\bseven\b/g, "7"], [/\beight\b/g, "8"],
    [/\bnine\b/g, "9"], [/\bten\b/g, "10"], [/\beleven\b/g, "11"],
    [/\btwelve\b/g, "12"],
    // Minutes
    [/\bthirty\b/g, "30"], [/\bfifteen\b/g, "15"],
    [/\bforty[-\s]?five\b/g, "45"], [/\bforty\b/g, "40"],
    [/\btwenty[-\s]?five\b/g, "25"], [/\btwenty\b/g, "20"],
    [/\bfifty\b/g, "50"], [/\boh\b/g, "0"],
  ];
  for (const [re, digit] of EN_NUMS) s = s.replace(re, digit);

  // DE: ein/eins/zwei/drei…zwölf
  const DE_NUMS: [RegExp, string][] = [
    [/\bnull\b/g, "0"], [/\beins?\b/g, "1"], [/\bzwei\b/g, "2"],
    [/\bdrei\b/g, "3"], [/\bvier\b/g, "4"], [/\bfünf\b/g, "5"],
    [/\bsechs\b/g, "6"], [/\bsieben\b/g, "7"], [/\bacht\b/g, "8"],
    [/\bneun\b/g, "9"], [/\bzehn\b/g, "10"], [/\belf\b/g, "11"],
    [/\bzwölf\b/g, "12"],
    [/\bdrei(?:ß|ss)ig\b/g, "30"], [/\bfünfzehn\b/g, "15"],
    [/\bvierzig\b/g, "40"], [/\bfünfundvierzig\b/g, "45"],
    [/\bzwanzig\b/g, "20"],
  ];
  for (const [re, digit] of DE_NUMS) s = s.replace(re, digit);

  // ── "half past" / "halb" patterns → HH:30 ───────────────────────────────────
  // EN: "half past nine" → "9:30", "half nine" → "9:30"
  s = s.replace(/half past (\d{1,2})/g, "$1:30");
  s = s.replace(/half (\d{1,2})/g, "$1:30");
  // DE: "halb neun" (= 8:30 in German convention, but users likely mean 9:30 colloquially)
  // We map "halb X" → "X:30" (informal/colloquial interpretation)
  s = s.replace(/halb (\d{1,2})/g, "$1:30");
  // "quarter past" → HH:15, "quarter to" → (H-1):45
  s = s.replace(/quarter past (\d{1,2})/g, (_, h) => `${h}:15`);
  s = s.replace(/quarter to (\d{1,2})/g, (_, h) => `${Math.max(0, parseInt(h) - 1)}:45`);
  // "viertel nach" (DE quarter past), "dreiviertel" (DE quarter to)
  s = s.replace(/viertel nach (\d{1,2})/g, (_, h) => `${h}:15`);
  s = s.replace(/dreiviertel (\d{1,2})/g, (_, h) => `${Math.max(0, parseInt(h) - 1)}:45`);

  // ── "o'clock" / "o clock" / "uhr" → strip (bare hour is valid) ──────────────
  s = s.replace(/(\d{1,2})\s+o'?\s*clock/g, "$1");
  s = s.replace(/(\d{1,2})\s+uhr/g, "$1");
  s = s.replace(/(\d{1,2})\s+година/g, "$1");

  // ── Bare hour + minute: "9 30" → "9:30" (MUST run BEFORE range separators) ─────
  // Whisper sometimes omits the colon, e.g. "nine thirty" → "9 30" after number conversion.
  // Pattern: hour (0-23) followed by a space and a two-digit minute (00-59).
  // Use word boundaries and negative lookahead/lookbehind to avoid false positives.
  s = s.replace(/\b([01]?\d|2[0-3])\s+(0[0-9]|[1-5][0-9])\b/g, "$1:$2");

  // ── Time range separators ────────────────────────────────────────────────────
  // "to" / "bis" / "до" between times: "9:30 to 10:00" → "9:30-10:00"
  // Also handles bare hours: "9 to 10" → "9-10", then bare-hour expansion below
  s = s.replace(/(\d{1,2}(?::\d{2})?)\s+to\s+(\d{1,2}(?::\d{2})?)/g, "$1-$2");
  s = s.replace(/(\d{1,2}(?::\d{2})?)\s+bis\s+(\d{1,2}(?::\d{2})?)/g, "$1-$2");
  s = s.replace(/(\d{1,2}(?::\d{2})?)\s+до\s+(\d{1,2}(?::\d{2})?)/g, "$1-$2");

  // ── Bare hour range: "9-10" → "9:00-10:00" ───────────────────────────────────
  // Only expand bare hours in a range (both sides have no colon)
  s = s.replace(/(?<![:\d])(\d{1,2})-(\d{1,2})(?![:\d])/g, (m, a, b) => `${a}:00-${b}:00`);
  // If start has :MM but end is bare hour: "9:25-10" → "9:25-10:00"
  s = s.replace(/(\d{1,2}:\d{2})-(\d{1,2})(?![:\d])/g, "$1-$2:00");

  return `/${s}`;
}

// ─── Voice message handler ───────────────────────────────────────────────────────────

async function handleVoiceMessage(message: TelegramMessage) {
  const chatId = message.chat.id;
  const userLangCode = message.from?.language_code;
  const lang = detectLang("", userLangCode);

  if (!message.voice) return;

  // 1. Get file path from Telegram
  const token = getBotToken();
  if (!token) return;

  const thinkingLabels: Record<Lang, string> = {
    en: "🎙 Transcribing voice message...",
    de: "🎙 Sprachnachricht wird transkribiert...",
    uk: "🎙 Транскрибую голосове повідомлення...",
  };
  await sendMessage(chatId, thinkingLabels[lang]);

  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${message.voice.file_id}`);
    const fileData = await fileRes.json() as { ok: boolean; result?: { file_path: string } };
    if (!fileData.ok || !fileData.result?.file_path) {
      return sendMessage(chatId, "❌ Could not retrieve voice file.");
    }
    const audioUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;

    // 2. Transcribe
    const { transcribeAudio } = await import("./_core/voiceTranscription");
    const result = await transcribeAudio({
      audioUrl,
      prompt: "Baby feeding log command. Expected format: log nica left 09:00-09:30 or log nici diaper wet",
    });

    if ("error" in result) {
      const errLabels: Record<Lang, string> = {
        en: `❌ Transcription failed: ${result.error}`,
        de: `❌ Transkription fehlgeschlagen: ${result.error}`,
        uk: `❌ Помилка транскрипції: ${result.error}`,
      };
      return sendMessage(chatId, errLabels[lang]);
    }

    const rawTranscribed = result.text.trim();
    const normalizedText = normalizeVoiceTranscription(rawTranscribed);
    console.log(`[TelegramBot] Voice transcribed: "${rawTranscribed}" → normalized: "${normalizedText}"`);

    // 3. Echo what was understood (show normalized form so user can verify)
    const echoLabels: Record<Lang, string> = {
      en: `🎙 Heard: <i>${rawTranscribed}</i>\n→ <code>${normalizedText}</code>`,
      de: `🎙 Verstanden: <i>${rawTranscribed}</i>\n→ <code>${normalizedText}</code>`,
      uk: `🎙 Почуто: <i>${rawTranscribed}</i>\n→ <code>${normalizedText}</code>`,
    };
    await sendMessage(chatId, echoLabels[lang]);

    // 4. Route through command dispatcher
    const [rawCmd, ...args] = normalizedText.replace(/@\w+/, "").slice(1).split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    const cmdLang = detectLang(args.join(" "), userLangCode);

    switch (cmd) {
      case "log":      return handleLog(args, chatId, cmdLang, true);
      case "delete":   return handleDelete(args, chatId, cmdLang, true);
      case "today":    return handleToday(chatId, cmdLang);
      case "week":     return handleWeek(chatId, cmdLang);
      case "summary":  return handleSummary(args, chatId, cmdLang);
      case "last":     return handleLast(args, chatId, cmdLang);
      case "settings": return handleSettings(chatId, cmdLang);
      case "version":  return handleVersion(chatId, cmdLang);
      case "help":
      case "start":    return handleHelp(chatId, cmdLang);
      default: {
        const unknownLabels: Record<Lang, string> = {
          en: `❓ Could not parse command from: "${rawTranscribed}"\nTry saying: log nica left 9 to 9:30`,
          de: `❓ Befehl nicht erkannt: "${rawTranscribed}"\nBeispiel: log nica links 9 bis 9:30`,
          uk: `❓ Не вдалося розпізнати команду: "${rawTranscribed}"\nСпробуйте: log nica ліво 9 до 9:30`,
        };
        return sendMessage(chatId, unknownLabels[lang]);
      }
    }
  } catch (err) {
    console.error("[TelegramBot] Voice handler error:", err);
    return sendMessage(chatId, "❌ An error occurred while processing the voice message.");
  }
}

// ─── Main webhook dispatcher ─────────────────────────────────────────────────────────

export async function handleWebhookUpdate(update: TelegramUpdate) {
  const message = update.message || update.edited_message;
  if (!message) return;

  const chatId = message.chat.id;
  const userLangCode = message.from?.language_code;

  // Handle voice messages
  if (message.voice) {
    return handleVoiceMessage(message);
  }

  if (!message.text) return;
  const text = message.text.trim();

  if (!text.startsWith("/")) return;

  // Strip bot username suffix (e.g. /log@smatchno_bot → /log)
  const [rawCmd, ...args] = text.replace(/@\w+/, "").slice(1).split(/\s+/);
  const cmd = rawCmd.toLowerCase();

  // Detect language from command args + message text + user locale
  const lang = detectLang(args.join(" "), userLangCode);

  console.log(`[TelegramBot] Command: /${cmd} args:`, args, `lang: ${lang}`);

  switch (cmd) {
    case "log":      return handleLog(args, chatId, lang);
    case "delete":   return handleDelete(args, chatId, lang);
    case "today":    return handleToday(chatId, lang);
    case "week":     return handleWeek(chatId, lang);
    case "summary":  return handleSummary(args, chatId, lang);
    case "last":     return handleLast(args, chatId, lang);
    case "snooze":   return handleSnooze(args, chatId, lang);
    case "status":   return handleStatus(chatId, lang);
    case "settings": return handleSettings(chatId, lang);
    case "version":  return handleVersion(chatId, lang);
    case "help":
    case "start":    return handleHelp(chatId, lang);
    default:
      return sendMessage(chatId, t("unknownCommand", lang));
  }
}

// ─── Deployment notification ─────────────────────────────────────────────────────────

/**
 * Post a release notification to the Telegram chat.
 * Reads the version from package.json and the top changelog section from CHANGELOG.md.
 * Call once after server startup (production only).
 */
export async function notifyDeployment(): Promise<void> {
  const token = getBotToken();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // silently skip if not configured

  try {
    const { readFileSync, writeFileSync, existsSync } = await import("fs");
    const { fileURLToPath } = await import("url");
    const { dirname, join } = await import("path");
    const __dirname = dirname(fileURLToPath(import.meta.url));

    // Read current version from package.json
    const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as { version: string };
    const version = pkg.version;

    // Compare against the last version we notified about.
    // The sentinel file lives outside the build output so it persists across restarts.
    const sentinelPath = join(__dirname, "../", ".last-deploy-version");
    const lastNotified = existsSync(sentinelPath)
      ? readFileSync(sentinelPath, "utf8").trim()
      : "";

    if (lastNotified === version) {
      console.log(`[TelegramBot] Deployment notification skipped — already sent for v${version}`);
      return;
    }

    // Read the top section of CHANGELOG.md (up to the next ## heading)
    let changelogSection = "";
    try {
      const raw = readFileSync(join(__dirname, "../CHANGELOG.md"), "utf8");
      const lines = raw.split("\n");
      let inBlock = false;
      const blockLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("## ")) {
          if (inBlock) break;
          inBlock = true;
          continue;
        }
        if (inBlock && line.trim()) blockLines.push(line.replace(/^- /, "• "));
      }
      changelogSection = blockLines.slice(0, 8).join("\n");
    } catch {
      // CHANGELOG.md missing — no problem
    }

    const body = [
      `🚀 <b>Baby Tracker v${version} deployed</b>`,
      ...(changelogSection ? ["", "<b>What's new:</b>", changelogSection] : []),
    ].join("\n");

    await sendMessage(chatId, body);

    // Persist the version so subsequent restarts don't re-notify
    writeFileSync(sentinelPath, version, "utf8");
    console.log(`[TelegramBot] Deployment notification sent (v${version})`);
  } catch (err) {
    console.error("[TelegramBot] Failed to send deployment notification:", err);
  }
}

// ─── Types ─────────────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}
interface TelegramMessage {
  message_id: number;
  from?: { id: number; username?: string; first_name?: string; language_code?: string };
  chat: { id: number; type: string; title?: string };
  text?: string;
  date: number;
  voice?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
}
