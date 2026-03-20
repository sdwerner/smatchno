import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  insertFeedingSession,
  getRecentFeedingSessions,
  getFeedingSessionsForDay,
  deleteFeedingSession,
  insertDiaperChange,
  getRecentDiaperChanges,
  getDiaperChangesForDay,
  deleteDiaperChange,
  getTelegramSettings,
  upsertTelegramSettings,
} from "./db";

const childSchema = z.enum(["nica", "nici"]);

// ─── Feeding Router ───────────────────────────────────────────────────────────

const feedingRouter = router({
  save: protectedProcedure
    .input(
      z.object({
        child: childSchema,
        leftStart: z.number().nullable().optional(),
        leftEnd: z.number().nullable().optional(),
        rightStart: z.number().nullable().optional(),
        rightEnd: z.number().nullable().optional(),
        bottleMl: z.number().nullable().optional(),
        notes: z.string().optional(),
        createdAt: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await insertFeedingSession({
        child: input.child,
        leftStart: input.leftStart ?? null,
        leftEnd: input.leftEnd ?? null,
        rightStart: input.rightStart ?? null,
        rightEnd: input.rightEnd ?? null,
        bottleMl: input.bottleMl ?? null,
        notes: input.notes ?? null,
        loggedBy: ctx.user.id,
        createdAt: input.createdAt,
      });
      return { success: true };
    }),

  recent: protectedProcedure
    .input(z.object({ child: childSchema, limit: z.number().optional() }))
    .query(async ({ input }) => {
      return getRecentFeedingSessions(input.child, input.limit ?? 20);
    }),

  forDay: protectedProcedure
    .input(z.object({ child: childSchema, dayStartMs: z.number(), dayEndMs: z.number() }))
    .query(async ({ input }) => {
      return getFeedingSessionsForDay(input.child, input.dayStartMs, input.dayEndMs);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteFeedingSession(input.id);
      return { success: true };
    }),
});

// ─── Diaper Router ────────────────────────────────────────────────────────────

const diaperRouter = router({
  save: protectedProcedure
    .input(
      z.object({
        child: childSchema,
        type: z.enum(["wet", "dirty", "both"]),
        notes: z.string().optional(),
        changedAt: z.number(),
        createdAt: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await insertDiaperChange({
        child: input.child,
        type: input.type,
        notes: input.notes ?? null,
        loggedBy: ctx.user.id,
        changedAt: input.changedAt,
        createdAt: input.createdAt,
      });
      return { success: true };
    }),

  recent: protectedProcedure
    .input(z.object({ child: childSchema, limit: z.number().optional() }))
    .query(async ({ input }) => {
      return getRecentDiaperChanges(input.child, input.limit ?? 20);
    }),

  forDay: protectedProcedure
    .input(z.object({ child: childSchema, dayStartMs: z.number(), dayEndMs: z.number() }))
    .query(async ({ input }) => {
      return getDiaperChangesForDay(input.child, input.dayStartMs, input.dayEndMs);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteDiaperChange(input.id);
      return { success: true };
    }),
});

// ─── Telegram Router ──────────────────────────────────────────────────────────

const telegramRouter = router({
  getSettings: protectedProcedure.query(async () => {
    return getTelegramSettings();
  }),

  saveSettings: protectedProcedure
    .input(
      z.object({
        botToken: z.string().optional(),
        chatId: z.string().optional(),
        enabled: z.boolean().optional(),
        digestTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        timezoneOffset: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await upsertTelegramSettings(input);
      return { success: true };
    }),

  sendTest: protectedProcedure.mutation(async () => {
    const settings = await getTelegramSettings();
    if (!settings?.botToken || !settings?.chatId) {
      throw new Error("Telegram bot token and chat ID are required");
    }
    const msg = `🍼 *Baby Tracker* — Test message!\n\nYour daily digest is configured correctly. ✅`;
    const res = await fetch(
      `https://api.telegram.org/bot${settings.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: settings.chatId,
          text: msg,
          parse_mode: "Markdown",
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram API error: ${err}`);
    }
    return { success: true };
  }),

  sendDigest: protectedProcedure
    .input(z.object({ dateMs: z.number() }))
    .mutation(async ({ input }) => {
      return sendTelegramDigest(input.dateMs);
    }),
});

// ─── Digest helper (also used by scheduler) ──────────────────────────────────

export async function sendTelegramDigest(dateMs: number) {
  const settings = await getTelegramSettings();
  // Fall back to env vars if DB settings not configured
  const botToken = settings?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = settings?.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return { skipped: true };
  if (settings && !settings.enabled) return { skipped: true };

  const dayStart = new Date(dateMs);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dateMs);
  dayEnd.setHours(23, 59, 59, 999);

  const [nicaFeeds, niciFeeds, nicaDiapers, niciDiapers] = await Promise.all([
    getFeedingSessionsForDay("nica", dayStart.getTime(), dayEnd.getTime()),
    getFeedingSessionsForDay("nici", dayStart.getTime(), dayEnd.getTime()),
    getDiaperChangesForDay("nica", dayStart.getTime(), dayEnd.getTime()),
    getDiaperChangesForDay("nici", dayStart.getTime(), dayEnd.getTime()),
  ]);

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const calcFeedingStats = (sessions: typeof nicaFeeds) => {
    let totalMs = 0;
    let lastFeedTime: number | null = null;
    for (const s of sessions) {
      if (s.leftStart && s.leftEnd) totalMs += s.leftEnd - s.leftStart;
      if (s.rightStart && s.rightEnd) totalMs += s.rightEnd - s.rightStart;
      if (!lastFeedTime || s.createdAt > lastFeedTime) lastFeedTime = s.createdAt;
    }
    return { totalMs, count: sessions.length, lastFeedTime };
  };

  const nicaStats = calcFeedingStats(nicaFeeds);
  const niciStats = calcFeedingStats(niciFeeds);

  const dateStr = new Date(dateMs).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const fmtTime = (ms: number | null) => ms ? new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—";

  const msg = [
    `🍼 *Baby Tracker* — ${dateStr}`,
    ``,
    `👶 *Nica*`,
    `  🤱 Stillsitzungen: ${nicaStats.count}`,
    `  ⏱ Gesamtzeit: ${nicaStats.totalMs > 0 ? formatDuration(nicaStats.totalMs) : "—"}`,
    `  🕐 Letzte Mahlzeit: ${fmtTime(nicaStats.lastFeedTime)}`,
    `  💧 Windeln: ${nicaDiapers.length} (💧${nicaDiapers.filter(d => d.type === "wet").length} 💩${nicaDiapers.filter(d => d.type === "dirty").length} 🔄${nicaDiapers.filter(d => d.type === "both").length})`,
    ``,
    `👶 *Nici*`,
    `  🤱 Stillsitzungen: ${niciStats.count}`,
    `  ⏱ Gesamtzeit: ${niciStats.totalMs > 0 ? formatDuration(niciStats.totalMs) : "—"}`,
    `  🕐 Letzte Mahlzeit: ${fmtTime(niciStats.lastFeedTime)}`,
    `  💧 Windeln: ${niciDiapers.length} (💧${niciDiapers.filter(d => d.type === "wet").length} 💩${niciDiapers.filter(d => d.type === "dirty").length} 🔄${niciDiapers.filter(d => d.type === "both").length})`,
  ].join("\n");

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
  return { success: true };
}

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  feeding: feedingRouter,
  diaper: diaperRouter,
  telegram: telegramRouter,
});

export type AppRouter = typeof appRouter;
