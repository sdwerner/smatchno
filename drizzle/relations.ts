import { relations } from "drizzle-orm";
import {
  users,
  feedingSessions,
  diaperChanges,
  vitaminDLogs,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  feedingSessions: many(feedingSessions),
  diaperChanges: many(diaperChanges),
  vitaminDLogs: many(vitaminDLogs),
}));

export const feedingSessionsRelations = relations(feedingSessions, ({ one }) => ({
  loggedByUser: one(users, {
    fields: [feedingSessions.loggedBy],
    references: [users.id],
  }),
}));

export const diaperChangesRelations = relations(diaperChanges, ({ one }) => ({
  loggedByUser: one(users, {
    fields: [diaperChanges.loggedBy],
    references: [users.id],
  }),
}));

export const vitaminDLogsRelations = relations(vitaminDLogs, ({ one }) => ({
  loggedByUser: one(users, {
    fields: [vitaminDLogs.loggedBy],
    references: [users.id],
  }),
}));
