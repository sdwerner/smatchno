import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => ({
  insertFeedingSession: vi.fn().mockResolvedValue(undefined),
  getRecentFeedingSessions: vi.fn().mockResolvedValue([]),
  getFeedingSessionsForDay: vi.fn().mockResolvedValue([]),
  deleteFeedingSession: vi.fn().mockResolvedValue(undefined),
  updateFeedingSession: vi.fn().mockResolvedValue(undefined),
  insertDiaperChange: vi.fn().mockResolvedValue(undefined),
  getRecentDiaperChanges: vi.fn().mockResolvedValue([]),
  getDiaperChangesForDay: vi.fn().mockResolvedValue([]),
  deleteDiaperChange: vi.fn().mockResolvedValue(undefined),
  updateDiaperChange: vi.fn().mockResolvedValue(undefined),
  getTelegramSettings: vi.fn().mockResolvedValue(null),
  upsertTelegramSettings: vi.fn().mockResolvedValue(undefined),
  insertVitaminDLog: vi.fn().mockResolvedValue(undefined),
  getVitaminDLogsForRange: vi.fn().mockResolvedValue([]),
  hasVitaminDToday: vi.fn().mockResolvedValue(false),
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

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Feeding Router — update ──────────────────────────────────────────────────

describe("feeding router — update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates a feeding session", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.feeding.update({
      id: 1,
      leftStart: 5000,
      leftEnd: 6000,
    });
    expect(result.success).toBe(true);
  });

  it("updates with notes", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.feeding.update({
      id: 1,
      notes: "Good session",
    });
    expect(result.success).toBe(true);
  });

  it("updates with null values", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.feeding.update({
      id: 1,
      leftStart: null,
      leftEnd: null,
      rightStart: null,
      rightEnd: null,
      bottleMl: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });
});

// ─── Feeding Router — forDay ──────────────────────────────────────────────────

describe("feeding router — forDay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns feeding sessions for a day", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.feeding.forDay({
      child: "nica",
      dayStartMs: 1000000,
      dayEndMs: 2000000,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Diaper Router — update ──────────────────────────────────────────────────

describe("diaper router — update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates a diaper change type", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.diaper.update({
      id: 1,
      type: "dirty",
    });
    expect(result.success).toBe(true);
  });

  it("updates a diaper change time", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.diaper.update({
      id: 1,
      changedAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });
});

// ─── Diaper Router — forDay ──────────────────────────────────────────────────

describe("diaper router — forDay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns diaper changes for a day", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.diaper.forDay({
      child: "nici",
      dayStartMs: 1000000,
      dayEndMs: 2000000,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Analytics Router ────────────────────────────────────────────────────────

describe("analytics router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns daily stats (public — no auth required)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analytics.dailyStats({
      dayStartMs: 1000000,
      dayEndMs: 2000000,
    });
    expect(result).toHaveProperty("nicaFeeds");
    expect(result).toHaveProperty("niciFeeds");
    expect(result).toHaveProperty("nicaDiapers");
    expect(result).toHaveProperty("niciDiapers");
    expect(Array.isArray(result.nicaFeeds)).toBe(true);
    expect(Array.isArray(result.niciFeeds)).toBe(true);
    expect(Array.isArray(result.nicaDiapers)).toBe(true);
    expect(Array.isArray(result.niciDiapers)).toBe(true);
  });

  it("returns weekly stats (public)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analytics.weeklyStats({
      weekStartMs: 1000000,
      weekEndMs: 7000000,
    });
    expect(result).toHaveProperty("nicaFeeds");
    expect(result).toHaveProperty("niciFeeds");
    expect(result).toHaveProperty("nicaDiapers");
    expect(result).toHaveProperty("niciDiapers");
  });
});

// ─── Vitamin D Router ────────────────────────────────────────────────────────

describe("vitaminD router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs a vitamin D administration", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.vitaminD.log({
      child: "nica",
      givenAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("logs vitamin D with notes", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.vitaminD.log({
      child: "nici",
      givenAt: Date.now(),
      notes: "Given after breakfast",
    });
    expect(result.success).toBe(true);
  });

  it("returns vitamin D calendar for a date range", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const now = Date.now();
    const result = await caller.vitaminD.calendar({
      startMs: now - 7 * 86400000,
      endMs: now,
    });
    expect(typeof result).toBe("object");
    // Result should be a map of date keys to { nica: boolean, nici: boolean }
    for (const [key, val] of Object.entries(result)) {
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(val).toHaveProperty("nica");
      expect(val).toHaveProperty("nici");
    }
  });

  it("checks if vitamin D was given today", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const now = Date.now();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const result = await caller.vitaminD.checkToday({
      child: "nica",
      dayStartMs: dayStart.getTime(),
      dayEndMs: dayEnd.getTime(),
    });
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });
});

// ─── Auth Router ─────────────────────────────────────────────────────────────

describe("auth router — me", () => {
  it("returns user when authenticated", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result!.openId).toBe("test-user");
    expect(result!.email).toBe("test@example.com");
  });

  it("returns null when not authenticated", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});
