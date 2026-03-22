import axios from "axios";
import { getDb } from "./db";
import { feedingSessions, diaperChanges } from "../drizzle/schema";
import { and, gte, lte, desc, eq } from "drizzle-orm";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

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

export async function buildDailySummary(dateMs: number, lang: Lang = "en"): Promise<string> {
  const db = await getDb();
  if (!db) return t("dbUnavailable", lang);

  const dayStart = startOfDay(new Date(dateMs)).getTime();
  const dayEnd = endOfDay(new Date(dateMs)).getTime();
  const dateLabel = format(new Date(dateMs), "dd.MM.yyyy");

  const headers: Record<Lang, string> = {
    en: `📊 <b>Daily Summary — ${dateLabel}</b>`,
    de: `📊 <b>Tagesübersicht — ${dateLabel}</b>`,
    uk: `📊 <b>Зведення за день — ${dateLabel}</b>`,
  };

  let msg = `${headers[lang]}\n\n`;

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
    const lastStr = lastFeedTime ? format(new Date(lastFeedTime), "HH:mm") : "—";

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
  const db = await getDb();
  if (!db) return t("dbUnavailable", lang);

  const now = new Date();
  const weekStart = startOfDay(subDays(now, 6)).getTime();
  const weekEnd = endOfDay(now).getTime();

  const headers: Record<Lang, string> = {
    en: "📈 <b>Weekly Summary (last 7 days)</b>",
    de: "📈 <b>Wochenübersicht (letzte 7 Tage)</b>",
    uk: "📈 <b>Тижневе зведення (7 днів)</b>",
  };

  let msg = `${headers[lang]}\n\n`;

  for (const child of ["nica", "nici"] as const) {
    const feedings = await db
      .select()
      .from(feedingSessions)
      .where(
        and(
          eq(feedingSessions.child, child),
          gte(feedingSessions.createdAt, weekStart),
          lte(feedingSessions.createdAt, weekEnd)
        )
      );

    const diapers = await db
      .select()
      .from(diaperChanges)
      .where(
        and(
          eq(diaperChanges.child, child),
          gte(diaperChanges.changedAt, weekStart),
          lte(diaperChanges.changedAt, weekEnd)
        )
      );

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
//   /log nica left 14:00-14:10 right 14:10-14:20
//   /log nici right 15:00-15:12
//   /log nica both 14:00-15:00          → both breasts, time split 50/50
//   /log both right 14:00-15:00         → both babies, right breast
//   /log both both 14:00-15:00          → both babies, both breasts, split 50/50
//   /log nica bottle 80                 → generic bottle
//   /log nica own 80                    → own milk bottle
//   /log nica other 80                  → other/formula milk bottle
//   /log nici right 14:00-15:00 own 15ml → breast + own bottle in one entry
//   /log nici diaper wet
// Child keywords: nica / nici / both (= both babies)
// Side keywords: left/links/ліво/l/li · right/rechts/право/r/re · both (= both breasts)
// Bottle keywords: bottle/flasche/b · own/eigen/expressed · other/andere/formula
// Diaper keywords: diaper/windel/підгузок/d/w

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
  const match = rangeStr.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!match) return null;
  const s = parseTime(match[1]);
  const e = parseTime(match[2]);
  if (!s || !e) return null;
  return { start: timeToMs(s.h, s.m, now), end: timeToMs(e.h, e.m, now) };
}

async function handleLog(args: string[], chatId: number, lang: Lang) {
  if (args.length < 2) {
    const usage: Record<Lang, string> = {
      en: `📝 <b>Usage:</b>\n<code>/log nica left 14:00-14:10 right 14:10-14:20</code>\n<code>/log nici both 14:00-15:00</code> (both breasts, split 50/50)\n<code>/log both right 14:00-15:00</code> (both babies)\n<code>/log nica own 80</code> (own milk) · <code>/log nica other 80</code> (formula)\n<code>/log nici right 14:00-15:00 own 15</code> (breast + bottle)\n<code>/log nici diaper wet</code>`,
      de: `📝 <b>Verwendung:</b>\n<code>/log nica links 14:00-14:10 rechts 14:10-14:20</code>\n<code>/log nici beide 14:00-15:00</code> (beide Brüste, 50/50)\n<code>/log beide rechts 14:00-15:00</code> (beide Babys)\n<code>/log nica eigen 80</code> (eigene Milch) · <code>/log nica andere 80</code> (Fremde)\n<code>/log nici windel nass</code>`,
      uk: `📝 <b>Використання:</b>\n<code>/log nica ліво 14:00-14:10 право 14:10-14:20</code>\n<code>/log nici обидві 14:00-15:00</code> (обидві груди, 50/50)\n<code>/log обидві право 14:00-15:00</code> (обидві дитини)\n<code>/log nica своє 80</code> (своє молоко) · <code>/log nica інше 80</code> (суміш)\n<code>/log nici підгузок мокра</code>`,
    };
    return sendMessage(chatId, usage[lang]);
  }

  const children = resolveChildren(args[0]);
  if (!children) return sendMessage(chatId, t("unknownChild", lang));

  const db = await getDb();
  if (!db) return sendMessage(chatId, t("dbUnavailable", lang));

  const now = new Date();
  let leftStart: number | null = null;
  let leftEnd: number | null = null;
  let rightStart: number | null = null;
  let rightEnd: number | null = null;
  let bottleMl: number | null = null;
  let bottleType: "generic" | "own" | "other" = "generic";
  let isDiaper = false;
  let diaperType: "wet" | "dirty" | "both" | null = null;

  // Parse remaining args
  let i = 1;
  while (i < args.length) {
    const token = args[i].toLowerCase();

    if (SIDE_LEFT.has(token)) {
      const range = args[i + 1];
      if (range) {
        const parsed = parseTimeRange(range, now);
        if (parsed) { leftStart = parsed.start; leftEnd = parsed.end; i += 2; continue; }
      }
    } else if (SIDE_RIGHT.has(token)) {
      const range = args[i + 1];
      if (range) {
        const parsed = parseTimeRange(range, now);
        if (parsed) { rightStart = parsed.start; rightEnd = parsed.end; i += 2; continue; }
      }
    } else if (SIDE_BOTH_BREAST.has(token)) {
      // Both breasts: parse total range, split 50/50
      const range = args[i + 1];
      if (range) {
        const parsed = parseTimeRange(range, now);
        if (parsed) {
          const half = Math.floor((parsed.end - parsed.start) / 2);
          leftStart = parsed.start;
          leftEnd = parsed.start + half;
          rightStart = parsed.start + half;
          rightEnd = parsed.end;
          i += 2;
          continue;
        }
      }
    } else if (SIDE_OWN.has(token)) {
      const mlStr = (args[i + 1] || "").replace(/ml$/i, "");
      const ml = parseInt(mlStr);
      bottleMl = !isNaN(ml) && ml > 0 ? ml : -1;
      bottleType = "own";
      i += (!isNaN(ml) && ml > 0) ? 2 : 1;
      continue;
    } else if (SIDE_OTHER.has(token)) {
      const mlStr = (args[i + 1] || "").replace(/ml$/i, "");
      const ml = parseInt(mlStr);
      bottleMl = !isNaN(ml) && ml > 0 ? ml : -1;
      bottleType = "other";
      i += (!isNaN(ml) && ml > 0) ? 2 : 1;
      continue;
    } else if (SIDE_BOTTLE.has(token)) {
      const mlStr = (args[i + 1] || "").replace(/ml$/i, "");
      const ml = parseInt(mlStr);
      if (!isNaN(ml) && ml > 0) {
        bottleMl = ml;
        i += 2;
        continue;
      } else {
        bottleMl = -1;
        i++;
        continue;
      }
    } else if (SIDE_DIAPER.has(token)) {
      isDiaper = true;
      const typeToken = (args[i + 1] || "").toLowerCase();
      diaperType = DIAPER_TYPE_MAP[typeToken] || null;
      i += diaperType ? 2 : 1;
      continue;
    }
    i++;
  }

  const createdAt = Date.now();

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
      await db.insert(diaperChanges).values({ child, type, notes: "via bot", loggedBy: null, changedAt: createdAt, createdAt });
    }
    const childDisplay = children.length > 1 ? "Nica & Nici" : (children[0] === "nica" ? "Nica" : "Nici");
    const doneLabels: Record<Lang, string> = {
      en: `✅ ${icons[type]} Diaper logged for <b>${childDisplay}</b>: <b>${typeLabels[lang][type]}</b>`,
      de: `✅ ${icons[type]} Windel für <b>${childDisplay}</b> eingetragen: <b>${typeLabels[lang][type]}</b>`,
      uk: `✅ ${icons[type]} Підгузок для <b>${childDisplay}</b> записано: <b>${typeLabels[lang][type]}</b>`,
    };
    return sendMessage(chatId, doneLabels[lang]);
  }

  // Handle feeding
  if (!leftStart && !rightStart && bottleMl === null) {
    const errLabels: Record<Lang, string> = {
      en: `❌ Could not parse. Example: <code>/log nica left 14:00-14:10</code>`,
      de: `❌ Konnte nicht lesen. Beispiel: <code>/log nica links 14:00-14:10</code>`,
      uk: `❌ Не вдалося розпізнати. Приклад: <code>/log nica ліво 14:00-14:10</code>`,
    };
    return sendMessage(chatId, errLabels[lang]);
  }

  const actualBottleMl = bottleMl === -1 ? null : bottleMl;
  const confirmParts: string[] = [];

  if (leftStart && leftEnd) confirmParts.push(`👈 Left: <b>${formatMs(leftEnd - leftStart)}</b>`);
  if (rightStart && rightEnd) confirmParts.push(`👉 Right: <b>${formatMs(rightEnd - rightStart)}</b>`);
  if (bottleMl && bottleMl > 0) {
    const bottleIcon = bottleType === "own" ? "🍼👩" : bottleType === "other" ? "🍼🥛" : "🍼";
    const bottleLabel = bottleType === "own" ? "Own milk" : bottleType === "other" ? "Formula" : "Bottle";
    confirmParts.push(`${bottleIcon} ${bottleLabel}: <b>${bottleMl} ml</b>`);
  }
  if (bottleMl === -1) confirmParts.push(`🍼 Bottle: <b>tbd</b>`);

  // Insert for each child
  for (const child of children) {
    await db.insert(feedingSessions).values({
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
  const doneLabels: Record<Lang, string> = {
    en: `✅ Feeding logged for <b>${childDisplay}</b>!\n${confirmParts.join(" · ")}`,
    de: `✅ Stillen für <b>${childDisplay}</b> eingetragen!\n${confirmParts.join(" · ")}`,
    uk: `✅ Годування для <b>${childDisplay}</b> записано!\n${confirmParts.join(" · ")}`,
  };
  await sendMessage(chatId, doneLabels[lang]);
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
  const summary = await buildDailySummary(targetDate.getTime(), lang);
  await sendMessage(chatId, summary, analyticsButton(lang));
}

async function handleLast(chatId: number, lang: Lang) {
  const db = await getDb();
  if (!db) return sendMessage(chatId, t("dbUnavailable", lang));

  const headers: Record<Lang, string> = {
    en: "🕐 <b>Last feedings</b>",
    de: "🕐 <b>Letzte Mahlzeiten</b>",
    uk: "🕐 <b>Останнє годування</b>",
  };
  const noRecordLabels: Record<Lang, string> = {
    en: "No feedings recorded",
    de: "Keine Einträge",
    uk: "Немає записів",
  };
  const agoLabels: Record<Lang, string> = {
    en: "ago",
    de: "vor",
    uk: "тому",
  };

  let msg = `${headers[lang]}\n\n`;

  for (const child of ["nica", "nici"] as const) {
    const rows = await db
      .select()
      .from(feedingSessions)
      .where(eq(feedingSessions.child, child))
      .orderBy(desc(feedingSessions.createdAt))
      .limit(1);

    const childLabel = child === "nica" ? "👧 <b>Nica</b>" : "👶 <b>Nici</b>";
    if (rows.length === 0) {
      msg += `${childLabel}: ${noRecordLabels[lang]}\n`;
    } else {
      const last = rows[0];
      const ago = Date.now() - last.createdAt;
      msg += `${childLabel}: ${format(new Date(last.createdAt), "HH:mm")} (<b>${formatMs(ago)} ${agoLabels[lang]}</b>)\n`;
    }
  }

  await sendMessage(chatId, msg);
}

async function handleHelp(chatId: number, lang: Lang) {
  const texts: Record<Lang, string> = {
    en: `🍼 <b>Baby Tracker — Commands</b>

<b>Breast feeding:</b>
<code>/log nica left 14:00-14:10 right 14:10-14:20</code>
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

<b>Analytics:</b>
<code>/today</code> — today's summary
<code>/week</code> — last 7 days
<code>/summary 19.03</code> — specific date
<code>/last</code> — last feeding per child`,

    de: `🍼 <b>Baby Tracker — Befehle</b>

<b>Stillen:</b>
<code>/log nica links 14:00-14:10 rechts 14:10-14:20</code>
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

<b>Analyse:</b>
<code>/today</code> — heutige Übersicht
<code>/week</code> — letzte 7 Tage
<code>/summary 19.03</code> — bestimmtes Datum
<code>/last</code> — letzte Mahlzeit je Kind`,

    uk: `🍼 <b>Baby Tracker — Команди</b>

<b>Грудне годування:</b>
<code>/log nica ліво 14:00-14:10 право 14:10-14:20</code>
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

<b>Аналітика:</b>
<code>/today</code> — зведення за сьогодні
<code>/week</code> — останні 7 днів
<code>/summary 19.03</code> — конкретна дата
<code>/last</code> — останнє годування`,
  };

  await sendMessage(chatId, texts[lang], analyticsButton(lang));
}

// ─── Main webhook dispatcher ─────────────────────────────────────────────────

export async function handleWebhookUpdate(update: TelegramUpdate) {
  const message = update.message || update.edited_message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const userLangCode = message.from?.language_code;

  if (!text.startsWith("/")) return;

  // Strip bot username suffix (e.g. /log@smatchno_bot → /log)
  const [rawCmd, ...args] = text.replace(/@\w+/, "").slice(1).split(/\s+/);
  const cmd = rawCmd.toLowerCase();

  // Detect language from command args + message text + user locale
  const lang = detectLang(args.join(" "), userLangCode);

  console.log(`[TelegramBot] Command: /${cmd} args:`, args, `lang: ${lang}`);

  switch (cmd) {
    case "log":     return handleLog(args, chatId, lang);
    case "today":   return handleToday(chatId, lang);
    case "week":    return handleWeek(chatId, lang);
    case "summary": return handleSummary(args, chatId, lang);
    case "last":    return handleLast(chatId, lang);
    case "help":
    case "start":   return handleHelp(chatId, lang);
    default:
      return sendMessage(chatId, t("unknownCommand", lang));
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
  from?: { id: number; username?: string; first_name?: string; language_code?: string };
  chat: { id: number; type: string; title?: string };
  text?: string;
  date: number;
}
