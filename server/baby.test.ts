import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => ({
  insertFeedingSession: vi.fn().mockResolvedValue(undefined),
  getRecentFeedingSessions: vi.fn().mockResolvedValue([
    {
      id: 1,
      child: "nica",
      leftStart: 1000000,
      leftEnd: 1010000,
      rightStart: null,
      rightEnd: null,
      bottleMl: null,
      notes: null,
      loggedBy: 1,
      createdAt: 1000000,
    },
  ]),
  getFeedingSessionsForDay: vi.fn().mockResolvedValue([]),
  deleteFeedingSession: vi.fn().mockResolvedValue(undefined),
  insertDiaperChange: vi.fn().mockResolvedValue(undefined),
  getRecentDiaperChanges: vi.fn().mockResolvedValue([
    {
      id: 1,
      child: "nici",
      type: "wet",
      notes: null,
      loggedBy: 1,
      changedAt: 2000000,
      createdAt: 2000000,
    },
  ]),
  getDiaperChangesForDay: vi.fn().mockResolvedValue([]),
  deleteDiaperChange: vi.fn().mockResolvedValue(undefined),
  getTelegramSettings: vi.fn().mockResolvedValue(null),
  upsertTelegramSettings: vi.fn().mockResolvedValue(undefined),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("feeding router", () => {
  it("saves a feeding session", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.feeding.save({
      child: "nica",
      leftStart: 1000000,
      leftEnd: 1010000,
      createdAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("returns recent feeding sessions for a child", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.feeding.recent({ child: "nica" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].child).toBe("nica");
  });

  it("deletes a feeding session", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.feeding.delete({ id: 1 });
    expect(result.success).toBe(true);
  });
});

describe("diaper router", () => {
  it("saves a diaper change", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const now = Date.now();
    const result = await caller.diaper.save({
      child: "nici",
      type: "wet",
      changedAt: now,
      createdAt: now,
    });
    expect(result.success).toBe(true);
  });

  it("returns recent diaper changes for a child", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.diaper.recent({ child: "nici" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].type).toBe("wet");
  });

  it("deletes a diaper change", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.diaper.delete({ id: 1 });
    expect(result.success).toBe(true);
  });
});

describe("telegram router", () => {
  it("returns null settings when none configured", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.telegram.getSettings();
    expect(result).toBeNull();
  });

  it("saves telegram settings", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.telegram.saveSettings({
      botToken: "test-token",
      chatId: "-1001234567890",
      enabled: true,
      digestTime: "21:00",
      timezoneOffset: 60,
    });
    expect(result.success).toBe(true);
  });
});
