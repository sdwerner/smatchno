import { eq, and, gte, lte, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2";
import { InsertUser, users, feedingSessions, diaperChanges, telegramSettings, vitaminDLogs, InsertFeedingSession, InsertDiaperChange, InsertVitaminDLog } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;
// Serialise reconnect attempts: if one caller is already reconnecting,
// subsequent callers wait for the same promise instead of creating duplicate pools.
let _reconnectPromise: Promise<void> | null = null;

export async function getDb() {
  // If a reconnect is already in progress, wait for it before proceeding
  if (_reconnectPromise) await _reconnectPromise;
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
        keepAliveInitialDelay: 0,       // send first keepalive immediately
        connectTimeout: 10000,
        // Drizzle/mysql2 pool will automatically evict stale connections
        // The withRetry wrapper handles any remaining ECONNRESET at query time
      });
      _db = drizzle(_pool);
      // Warm up the pool: run SELECT 1 to verify the connection is actually alive.
      // createPool() is lazy — it doesn't open a TCP connection until the first query.
      // Without this, the first real query after a reconnect can still hit ECONNRESET.
      await new Promise<void>((resolve, reject) => {
        _pool!.query("SELECT 1", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      startPing(); // keep the pool alive with periodic SELECT 1
      console.log("[Database] Connection pool created and verified");
    } catch (error) {
      console.warn("[Database] Failed to connect or verify:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

// Periodic keep-alive ping: runs SELECT 1 every 4 minutes to prevent
// the MySQL server from closing idle connections (ECONNRESET on next query).
let _pingInterval: ReturnType<typeof setInterval> | null = null;

function startPing() {
  if (_pingInterval) return; // already running
  _pingInterval = setInterval(async () => {
    if (!_pool) return;
    _pool.query("SELECT 1", (err) => {
      if (err) {
        console.warn("[Database] Keep-alive ping failed:", err.message);
        // Proactively reconnect so the pool is ready before the next real query
        if (!_reconnectPromise) {
          _reconnectPromise = (async () => {
            resetDb();
            await new Promise(resolve => setTimeout(resolve, 500));
            await getDb();
          })().finally(() => { _reconnectPromise = null; });
        }
      }
    });
  }, 90 * 1000); // every 90 seconds (MySQL closes idle connections in ~2-5 min)
}

// Reset the db handle so the next call to getDb() creates a fresh pool.
// Called automatically when a query fails with a connection error.
export function resetDb() {
  console.warn("[Database] Resetting connection pool due to error");
  if (_pingInterval) { clearInterval(_pingInterval); _pingInterval = null; }
  try { _pool?.end(); } catch { /* ignore */ }
  _db = null;
  _pool = null;
}

// Returns true if the error (or its .cause) is a transient connection error
function isConnectionError(err: unknown): boolean {
  const CONNECTION_ERRORS = ["ECONNRESET", "ECONNREFUSED", "PROTOCOL_CONNECTION_LOST", "ETIMEDOUT"];
  const check = (msg: string) => CONNECTION_ERRORS.some(e => msg.includes(e));
  if (err instanceof Error) {
    if (check(err.message)) return true;
    // DrizzleQueryError wraps the real error in .cause — check that too
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && check(cause.message)) return true;
    // Also check error code property (mysql2 sets err.code)
    const code = (err as Error & { code?: string }).code ?? "";
    if (CONNECTION_ERRORS.some(e => code.includes(e))) return true;
  }
  return false;
}

// Wrapper that retries up to MAX_RETRIES times after a connection reset,
// with exponential backoff. Uses _reconnectPromise to serialise concurrent
// reconnect attempts so only one caller drives the pool reset.
const MAX_RETRIES = 3;
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (!isConnectionError(err)) throw err; // non-connection errors bubble immediately
      lastErr = err;
      console.warn(`[Database] Connection error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), reconnecting...`,
        err instanceof Error ? err.message : err);
      // Only one caller should drive the reconnect; others wait on the same promise.
      if (!_reconnectPromise) {
        _reconnectPromise = (async () => {
          resetDb();
          // Exponential backoff: 500ms, 1s, 2s
          const delay = 500 * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          await getDb(); // create fresh pool (includes SELECT 1 warm-up)
        })().finally(() => { _reconnectPromise = null; });
      }
      await _reconnectPromise;
      // If getDb() failed (pool still null), wait a bit more before retrying
      if (!_db) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  throw lastErr;
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

export async function getLastFeedingSession(child: "nica" | "nici") {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(feedingSessions)
      .where(eq(feedingSessions.child, child))
      .orderBy(desc(feedingSessions.createdAt))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
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

export async function getLastDiaperChange(child: "nica" | "nici") {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(diaperChanges)
      .where(eq(diaperChanges.child, child))
      .orderBy(desc(diaperChanges.changedAt))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
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

// ─── Vitamin D Logs ───────────────────────────────────────────────────────────

export async function insertVitaminDLog(data: InsertVitaminDLog) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.insert(vitaminDLogs).values(data);
  });
}

/** Returns all Vitamin D logs for a child within a UTC ms time range (inclusive). */
export async function getVitaminDLogsForRange(
  child: "nica" | "nici",
  startMs: number,
  endMs: number
) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(vitaminDLogs)
      .where(
        and(
          eq(vitaminDLogs.child, child),
          gte(vitaminDLogs.givenAt, startMs),
          lte(vitaminDLogs.givenAt, endMs)
        )
      )
      .orderBy(desc(vitaminDLogs.givenAt));
  });
}

/** Returns the most recent Vitamin D log for a child, or null if none. */
export async function getLastVitaminDLog(child: "nica" | "nici") {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(vitaminDLogs)
      .where(eq(vitaminDLogs.child, child))
      .orderBy(desc(vitaminDLogs.givenAt))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  });
}

/** Returns true if a Vitamin D log exists for the given child within the day window (UTC ms). */
export async function hasVitaminDToday(
  child: "nica" | "nici",
  dayStartMs: number,
  dayEndMs: number
): Promise<boolean> {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return false;
    const rows = await db
      .select()
      .from(vitaminDLogs)
      .where(
        and(
          eq(vitaminDLogs.child, child),
          gte(vitaminDLogs.givenAt, dayStartMs),
          lte(vitaminDLogs.givenAt, dayEndMs)
        )
      )
      .limit(1);
    return rows.length > 0;
  });
}
