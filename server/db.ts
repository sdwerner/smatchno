import { eq, and, gte, lte, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, feedingSessions, diaperChanges, telegramSettings, InsertFeedingSession, InsertDiaperChange } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
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
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Feeding Sessions ────────────────────────────────────────────────────────

export async function insertFeedingSession(data: InsertFeedingSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(feedingSessions).values(data);
}

export async function getFeedingSessionsForDay(child: "nica" | "nici", dayStartMs: number, dayEndMs: number) {
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
}

export async function getRecentFeedingSessions(child: "nica" | "nici", limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(feedingSessions)
    .where(eq(feedingSessions.child, child))
    .orderBy(desc(feedingSessions.createdAt))
    .limit(limit);
}

export async function deleteFeedingSession(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(feedingSessions).where(eq(feedingSessions.id, id));
}

// ─── Diaper Changes ───────────────────────────────────────────────────────────

export async function insertDiaperChange(data: InsertDiaperChange) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(diaperChanges).values(data);
}

export async function getDiaperChangesForDay(child: "nica" | "nici", dayStartMs: number, dayEndMs: number) {
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
}

export async function getRecentDiaperChanges(child: "nica" | "nici", limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(diaperChanges)
    .where(eq(diaperChanges.child, child))
    .orderBy(desc(diaperChanges.changedAt))
    .limit(limit);
}

export async function deleteDiaperChange(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(diaperChanges).where(eq(diaperChanges.id, id));
}

// ─── Telegram Settings ────────────────────────────────────────────────────────

export async function getTelegramSettings() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(telegramSettings).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertTelegramSettings(data: {
  botToken?: string;
  chatId?: string;
  enabled?: boolean;
  digestTime?: string;
  timezoneOffset?: number;
}) {
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
}
