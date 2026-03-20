import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module so tests don't need a real database
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// Mock axios to capture sendMessage calls
vi.mock("axios", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { ok: true } }),
  },
}));

import axios from "axios";
import { handleWebhookUpdate, buildDailySummary } from "./telegramBot";

const mockedAxios = vi.mocked(axios.post);

function makeUpdate(text: string, chatId = 12345) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: chatId, type: "group" },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  };
}

describe("Telegram bot command routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responds to /help with command list", async () => {
    await handleWebhookUpdate(makeUpdate("/help"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const call = mockedAxios.mock.calls[0];
    const body = call[1] as { text: string };
    expect(body.text).toContain("Baby Tracker Commands");
    expect(body.text).toContain("/feed");
    expect(body.text).toContain("/diaper");
  });

  it("responds to /start with help message", async () => {
    await handleWebhookUpdate(makeUpdate("/start"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Baby Tracker Commands");
  });

  it("responds to unknown command with error message", async () => {
    await handleWebhookUpdate(makeUpdate("/unknowncommand"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Unknown command");
  });

  it("ignores non-command messages", async () => {
    await handleWebhookUpdate(makeUpdate("Hello there!"));
    expect(mockedAxios).not.toHaveBeenCalled();
  });

  it("handles /feed with missing args gracefully", async () => {
    await handleWebhookUpdate(makeUpdate("/feed"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Usage");
  });

  it("handles /diaper with invalid child gracefully", async () => {
    await handleWebhookUpdate(makeUpdate("/diaper unknown wet"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Unknown child");
  });

  it("handles /diaper with invalid type gracefully", async () => {
    await handleWebhookUpdate(makeUpdate("/diaper nica soaked"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Unknown type");
  });

  it("handles /bottle with missing args gracefully", async () => {
    await handleWebhookUpdate(makeUpdate("/bottle"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Usage");
  });

  it("handles /bottle with invalid ml gracefully", async () => {
    await handleWebhookUpdate(makeUpdate("/bottle nica abc"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Invalid amount");
  });

  it("strips bot username suffix from commands", async () => {
    await handleWebhookUpdate(makeUpdate("/help@smatchno_bot"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Baby Tracker Commands");
  });

  it("handles updates without message text gracefully", async () => {
    await handleWebhookUpdate({ update_id: 1 });
    expect(mockedAxios).not.toHaveBeenCalled();
  });
});

describe("buildDailySummary", () => {
  it("returns database unavailable message when db is null", async () => {
    const result = await buildDailySummary(Date.now());
    expect(result).toContain("Database not available");
  });
});
