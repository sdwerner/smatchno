import { describe, it, expect, vi, afterEach } from "vitest";
import {
  startVitaminDReminder,
  stopVitaminDReminder,
} from "./vitaminDReminder";

// Mock dependencies
vi.mock("./db", () => ({
  hasVitaminDToday: vi.fn().mockResolvedValue(false),
}));

vi.mock("./telegramBot", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

describe("vitaminDReminder — start/stop", () => {
  afterEach(() => {
    stopVitaminDReminder();
  });

  it("startVitaminDReminder creates an interval without error", () => {
    startVitaminDReminder();
    // Calling again should replace interval
    startVitaminDReminder();
    stopVitaminDReminder();
  });

  it("stopVitaminDReminder clears interval safely", () => {
    startVitaminDReminder();
    stopVitaminDReminder();
    // Double-stop should be safe
    stopVitaminDReminder();
  });

  it("stopVitaminDReminder is safe when never started", () => {
    stopVitaminDReminder();
  });
});
