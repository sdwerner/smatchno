import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  bigint,
  boolean,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Which child the entry belongs to
export type ChildName = "nica" | "nici";

// Feeding sessions: tracks left breast, right breast, and bottle
export const feedingSessions = mysqlTable("feeding_sessions", {
  id: int("id").autoincrement().primaryKey(),
  child: mysqlEnum("child", ["nica", "nici"]).notNull(),
  // Left breast: start/end as UTC ms timestamps
  leftStart: bigint("leftStart", { mode: "number" }),
  leftEnd: bigint("leftEnd", { mode: "number" }),
  // Right breast: start/end as UTC ms timestamps
  rightStart: bigint("rightStart", { mode: "number" }),
  rightEnd: bigint("rightEnd", { mode: "number" }),
  // Bottle feeding in ml
  bottleMl: int("bottleMl"),
  // Notes
  notes: text("notes"),
  // Who logged it
  loggedBy: int("loggedBy").references(() => users.id),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type FeedingSession = typeof feedingSessions.$inferSelect;
export type InsertFeedingSession = typeof feedingSessions.$inferInsert;

// Diaper changes
export const diaperChanges = mysqlTable("diaper_changes", {
  id: int("id").autoincrement().primaryKey(),
  child: mysqlEnum("child", ["nica", "nici"]).notNull(),
  type: mysqlEnum("type", ["wet", "dirty", "both"]).notNull(),
  notes: text("notes"),
  loggedBy: int("loggedBy").references(() => users.id),
  changedAt: bigint("changedAt", { mode: "number" }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type DiaperChange = typeof diaperChanges.$inferSelect;
export type InsertDiaperChange = typeof diaperChanges.$inferInsert;

// Telegram settings (one row per app, shared)
export const telegramSettings = mysqlTable("telegram_settings", {
  id: int("id").autoincrement().primaryKey(),
  botToken: varchar("botToken", { length: 256 }),
  chatId: varchar("chatId", { length: 64 }),
  enabled: boolean("enabled").default(false).notNull(),
  // HH:MM in local time (stored as string)
  digestTime: varchar("digestTime", { length: 5 }).default("21:00").notNull(),
  // Timezone offset in minutes from UTC (e.g. 60 for UTC+1)
  timezoneOffset: int("timezoneOffset").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TelegramSettings = typeof telegramSettings.$inferSelect;
export type InsertTelegramSettings = typeof telegramSettings.$inferInsert;
