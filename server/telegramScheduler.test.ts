import { describe, it, expect, vi, afterEach } from "vitest";
import {
  startTelegramScheduler,
  stopTelegramScheduler,
} from "./telegramScheduler";

// Mock dependencies
vi.mock("./db", () => ({
  getTelegramSettings: vi.fn().mockResolvedValue(null),
}));

vi.mock("./routers", () => ({
  sendTelegramDigest: vi.fn().mockResolvedValue({ success: true }),
}));

describe("telegramScheduler — start/stop", () => {
  afterEach(() => {
    stopTelegramScheduler();
  });

  it("startTelegramScheduler creates an interval without error", () => {
    startTelegramScheduler();
    // Calling again should replace interval
    startTelegramScheduler();
    stopTelegramScheduler();
  });

  it("stopTelegramScheduler clears interval safely", () => {
    startTelegramScheduler();
    stopTelegramScheduler();
    // Double-stop should be safe
    stopTelegramScheduler();
  });

  it("stopTelegramScheduler is safe when never started", () => {
    stopTelegramScheduler();
  });
});
