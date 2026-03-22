import { eq, and, gte, lte, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2";
import { InsertUser, users, feedingSessions, diaperChanges, telegramSettings, InsertFeedingSession, InsertDiaperChange } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Use a connection pool so idle connections are automatically recycled
      // and ECONNRESET errors don't permanently break the db handle
      _pool = createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
      _db = drizzle(_pool);
      console.log("[Database] Connection pool created");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

// Reset the db handle so the next call to getDb() creates a fresh pool.
// Called automatically when a query fails with a connection error.
export function resetDb() {
  console.warn("[Database] Resetting connection pool due to error");
  try { _pool?.end(); } catch { /* ignore */ }
  _db = null;
  _pool = null;
}

// Wrapper that retries once after a connection reset
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNRESET") || msg.includes("ECONNREFUSED") || msg.includes("PROTOCOL_CONNECTION_LOST")) {
      resetDb();
      await getDb(); // reconnect
      return await fn(); // retry once
    }
    throw err;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  return withRetry(async () => {
    const db = await getDb();
    if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  });
}

export async function getUserByOpenId(openId: string) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  });
}

// ─── Feeding Sessions ────────────────────────────────────────────────────────

export async function insertFeedingSession(data: InsertFeedingSession) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.insert(feedingSessions).values(data);
  });
}

export async function getFeedingSessionsForDay(child: "nica" | "nici", dayStartMs: number, dayEndMs: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(feedingSessions)
      .where(
        and(
          eq(feedingSessions.child, child),
          gte(feedingSessions.createdAt, dayStartMs),
          lte(feedingSessions.createdAt, dayEndMs)
        )
      )
      .orderBy(desc(feedingSessions.createdAt));
  });
}

export async function getRecentFeedingSessions(child: "nica" | "nici", limit = 20) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(feedingSessions)
      .where(eq(feedingSessions.child, child))
      .orderBy(desc(feedingSessions.createdAt))
      .limit(limit);
  });
}

export async function deleteFeedingSession(id: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.delete(feedingSessions).where(eq(feedingSessions.id, id));
  });
}

export async function deleteLastFeedingSession(child: "nica" | "nici") {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const rows = await db
      .select()
      .from(feedingSessions)
      .where(eq(feedingSessions.child, child))
      .orderBy(desc(feedingSessions.createdAt))
      .limit(1);
    if (rows.length === 0) return null;
    await db.delete(feedingSessions).where(eq(feedingSessions.id, rows[0].id));
    return rows[0];
  });
}

export async function updateFeedingSession(
  id: number,
  data: Partial<{
    leftStart: number | null;
    leftEnd: number | null;
    rightStart: number | null;
    rightEnd: number | null;
    bottleMl: number | null;
    bottleType: string | null;
    notes: string | null;
    createdAt: number;
  }>
) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.update(feedingSessions).set(data).where(eq(feedingSessions.id, id));
  });
}

// ─── Diaper Changes ───────────────────────────────────────────────────────────

export async function insertDiaperChange(data: InsertDiaperChange) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.insert(diaperChanges).values(data);
  });
}

export async function getDiaperChangesForDay(child: "nica" | "nici", dayStartMs: number, dayEndMs: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(diaperChanges)
      .where(
        and(
          eq(diaperChanges.child, child),
          gte(diaperChanges.changedAt, dayStartMs),
          lte(diaperChanges.changedAt, dayEndMs)
        )
      )
      .orderBy(desc(diaperChanges.changedAt));
  });
}

export async function getRecentDiaperChanges(child: "nica" | "nici", limit = 20) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(diaperChanges)
      .where(eq(diaperChanges.child, child))
      .orderBy(desc(diaperChanges.changedAt))
      .limit(limit);
  });
}

export async function deleteDiaperChange(id: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.delete(diaperChanges).where(eq(diaperChanges.id, id));
  });
}

export async function deleteLastDiaperChange(child: "nica" | "nici") {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const rows = await db
      .select()
      .from(diaperChanges)
      .where(eq(diaperChanges.child, child))
      .orderBy(desc(diaperChanges.changedAt))
      .limit(1);
    if (rows.length === 0) return null;
    await db.delete(diaperChanges).where(eq(diaperChanges.id, rows[0].id));
    return rows[0];
  });
}

export async function updateDiaperChange(
  id: number,
  data: Partial<{ type: "wet" | "dirty" | "both"; changedAt: number }>
) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.update(diaperChanges).set(data).where(eq(diaperChanges.id, id));
  });
}

// ─── Telegram Settings ────────────────────────────────────────────────────────

export async function getTelegramSettings() {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(telegramSettings).limit(1);
    return result.length > 0 ? result[0] : null;
  });
}

export async function upsertTelegramSettings(data: {
  botToken?: string;
  chatId?: string;
  enabled?: boolean;
  digestTime?: string;
  timezoneOffset?: number;
}) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const existing = await getTelegramSettings();
    if (existing) {
      await db.update(telegramSettings).set(data).where(eq(telegramSettings.id, existing.id));
    } else {
      await db.insert(telegramSettings).values({
        botToken: data.botToken ?? null,
        chatId: data.chatId ?? null,
        enabled: data.enabled ?? false,
        digestTime: data.digestTime ?? "21:00",
        timezoneOffset: data.timezoneOffset ?? 0,
      });
    }
  });
}
