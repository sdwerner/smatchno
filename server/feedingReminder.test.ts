import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setSnooze,
  clearSnooze,
  getSnoozeRemaining,
  getLastReminderSent,
  startFeedingReminder,
  stopFeedingReminder,
} from "./feedingReminder";

// Mock dependencies so we don't hit a real DB or Telegram
vi.mock("./db", () => ({
  getRecentFeedingSessions: vi.fn().mockResolvedValue([]),
}));

vi.mock("./telegramBot", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

describe("feedingReminder — snooze", () => {
  beforeEach(() => {
    clearSnooze();
  });

  it("getSnoozeRemaining returns 0 when not snoozed", () => {
    expect(getSnoozeRemaining()).toBe(0);
  });

  it("setSnooze sets a future snooze", () => {
    const future = Date.now() + 60_000;
    setSnooze(future);
    expect(getSnoozeRemaining()).toBeGreaterThan(0);
    expect(getSnoozeRemaining()).toBeLessThanOrEqual(60_000);
  });

  it("clearSnooze resets snooze to 0", () => {
    setSnooze(Date.now() + 60_000);
    clearSnooze();
    expect(getSnoozeRemaining()).toBe(0);
  });

  it("getSnoozeRemaining returns 0 for past timestamp", () => {
    setSnooze(Date.now() - 1000);
    expect(getSnoozeRemaining()).toBe(0);
  });
});

describe("feedingReminder — getLastReminderSent", () => {
  it("returns 0 for unknown child", () => {
    expect(getLastReminderSent("unknown-child")).toBe(0);
  });

  it("returns 0 for nica when no reminder sent", () => {
    expect(getLastReminderSent("nica")).toBe(0);
  });
});

describe("feedingReminder — start/stop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("startFeedingReminder creates an interval", () => {
    startFeedingReminder();
    // Calling again should not throw (replaces previous interval)
    startFeedingReminder();
    stopFeedingReminder();
  });

  it("stopFeedingReminder clears the interval", () => {
    startFeedingReminder();
    stopFeedingReminder();
    // Calling stop again when no interval should be safe
    stopFeedingReminder();
  });

  afterEach(() => {
    vi.useRealTimers();
    stopFeedingReminder();
  });
});
