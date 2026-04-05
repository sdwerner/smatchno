import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module so tests don't need a real database
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  // Write helpers: throw to simulate DB unavailable (tests check for error message)
  insertFeedingSession: vi.fn().mockRejectedValue(new Error("Database not available")),
  insertDiaperChange: vi.fn().mockRejectedValue(new Error("Database not available")),
  insertVitaminDLog: vi.fn().mockRejectedValue(new Error("Database not available")),
  // Read helpers: return empty/null to simulate no data (tests check for "no records" message)
  getLastFeedingSession: vi.fn().mockResolvedValue(null),
  getLastDiaperChange: vi.fn().mockResolvedValue(null),
  getFeedingSessionsForDay: vi.fn().mockResolvedValue([]),
  getDiaperChangesForDay: vi.fn().mockResolvedValue([]),
  // Delete helpers: throw to simulate DB unavailable
  deleteLastFeedingSession: vi.fn().mockRejectedValue(new Error("Database not available")),
  deleteLastDiaperChange: vi.fn().mockRejectedValue(new Error("Database not available")),
  getTelegramSettings: vi.fn().mockResolvedValue(null),
}));

// Mock axios to capture sendMessage calls
vi.mock("axios", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { ok: true } }),
  },
}));

import axios from "axios";
import { handleWebhookUpdate, buildDailySummary, normalizeVoiceTranscription, type TelegramUpdate } from "./telegramBot";

const mockedAxios = vi.mocked(axios.post);

function makeUpdate(text: string, langCode = "en"): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 123, first_name: "Test", language_code: langCode },
      chat: { id: -5294676445, type: "group", title: "Baby Tracker" },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  };
}

describe("Telegram bot — /help and /start", () => {
  beforeEach(() => vi.clearAllMocks());

  it("responds to /help with command list (EN)", async () => {
    await handleWebhookUpdate(makeUpdate("/help", "en"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Baby Tracker");
    expect(body.text).toContain("/log");
    expect(body.text).toContain("/today");
  });

  it("responds to /start the same as /help", async () => {
    await handleWebhookUpdate(makeUpdate("/start", "en"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Baby Tracker");
  });

  it("responds to /help in German when lang code is de", async () => {
    await handleWebhookUpdate(makeUpdate("/help", "de"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Befehle");
  });

  it("responds to /help in Ukrainian when lang code is uk", async () => {
    await handleWebhookUpdate(makeUpdate("/help", "uk"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Команди");
  });

  it("strips bot username suffix from commands", async () => {
    await handleWebhookUpdate(makeUpdate("/help@smatchno_bot", "en"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Baby Tracker");
  });
});

describe("Telegram bot — /log validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows usage when /log has no args", async () => {
    await handleWebhookUpdate(makeUpdate("/log"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Usage");
  });

  it("shows unknown child error for invalid child name", async () => {
    await handleWebhookUpdate(makeUpdate("/log baby left 14:00-14:10"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Unknown child");
  });

  it("shows db unavailable for valid /log nica left (no db)", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica left 14:00-14:10"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Database not available");
  });

  it("shows db unavailable for /log nici bottle 80 (no db)", async () => {
    await handleWebhookUpdate(makeUpdate("/log nici bottle 80"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Database not available");
  });

  it("shows db unavailable for /log nica diaper wet (no db)", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica diaper wet"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Database not available");
  });
});

describe("Telegram bot — analytics commands", () => {
  beforeEach(() => vi.clearAllMocks());

  it("/today returns daily summary (with empty data in test)", async () => {
    await handleWebhookUpdate(makeUpdate("/today"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    // With mocked empty DB, returns a summary with 0 feedings
    expect(body.text).toContain("Daily Summary");
  });

  it("/week returns weekly summary (with empty data in test)", async () => {
    await handleWebhookUpdate(makeUpdate("/week"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Weekly Summary");
  });

  it("/summary returns daily summary for specified date (with empty data in test)", async () => {
    await handleWebhookUpdate(makeUpdate("/summary 19.03"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Daily Summary");
    expect(body.text).toContain("19.03");
  });

  it("/last returns last status (with empty data in test)", async () => {
    await handleWebhookUpdate(makeUpdate("/last"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Last status");
  });
});

describe("Telegram bot — language detection from content", () => {
  beforeEach(() => vi.clearAllMocks());

  it("detects German from 'links' keyword in message", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica links 14:00-14:10", "en"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    // German response for db unavailable
    expect(body.text).toContain("Datenbank");
  });

  it("detects Ukrainian from Cyrillic characters", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica ліво 14:00-14:10", "en"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("База даних");
  });
});

describe("Telegram bot — edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("responds with unknown command for unrecognised command", async () => {
    await handleWebhookUpdate(makeUpdate("/xyz"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Unknown command");
  });

  it("ignores non-command messages", async () => {
    await handleWebhookUpdate(makeUpdate("Hello, this is a normal message"));
    expect(mockedAxios).not.toHaveBeenCalled();
  });

  it("handles update with no message gracefully", async () => {
    await handleWebhookUpdate({ update_id: 1 });
    expect(mockedAxios).not.toHaveBeenCalled();
  });
});

describe("buildDailySummary", () => {
  it("returns daily summary with empty data (no db needed with mocked helpers)", async () => {
    const result = await buildDailySummary(Date.now());
    // With mocked empty helpers, returns a valid summary with 0 feedings
    expect(result).toContain("Daily Summary");
    expect(result).toContain("Nica");
    expect(result).toContain("Nici");
  });
});

describe("Telegram bot — /log new features (no db)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("/log both right — both babies — returns db unavailable", async () => {
    await handleWebhookUpdate(makeUpdate("/log both right 14:00-15:00"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Database not available");
  });

  it("/log nica both — both breasts — returns db unavailable", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica both 14:00-15:00"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Database not available");
  });

  it("/log both both — both babies both breasts — returns db unavailable", async () => {
    await handleWebhookUpdate(makeUpdate("/log both both 14:00-15:00"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Database not available");
  });

  it("/log nica own 80 — own milk bottle — returns db unavailable", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica own 80"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Database not available");
  });

  it("/log nica other 80 — formula bottle — returns db unavailable", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica other 80"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Database not available");
  });

  it("/log nici right 14:00-15:00 own 15ml — combined — returns db unavailable", async () => {
    await handleWebhookUpdate(makeUpdate("/log nici right 14:00-15:00 own 15ml"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Database not available");
  });

  it("/log nica own bottle 19:25-19:30 — time range hour must NOT be parsed as ml", async () => {
    // Regression: parseInt("19:25-19:30") === 19, which was incorrectly used as bottleMl
    await handleWebhookUpdate(makeUpdate("/log nica own bottle 19:25-19:30"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    // Should NOT confirm "19 ml" — the time range is not an ml amount
    expect(body.text).not.toMatch(/19\s*ml/i);
    // Should reach db (not unknown child / usage error)
    expect(body.text).not.toContain("Unknown child");
    expect(body.text).not.toContain("Usage");
  });

  it("/log nica own 65 — explicit ml with no time range — should NOT be rejected", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica own 65"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    // Should reach db (not unknown child / usage error)
    expect(body.text).not.toContain("Unknown child");
    expect(body.text).not.toContain("Usage");
  });

  it("/log nica own 80 in German (eigen) — returns German db error", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica eigen 80", "de"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Datenbank");
  });

  it("shows usage for /log with only child name", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Usage");
  });

  it("'both' as child resolves correctly (not unknown child)", async () => {
    await handleWebhookUpdate(makeUpdate("/log both right 14:00-15:00"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    // Should NOT say unknown child
    expect(body.text).not.toContain("Unknown child");
  });

  it("/help shows new both-breast and own/other syntax", async () => {
    await handleWebhookUpdate(makeUpdate("/help", "en"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("both breasts");
    expect(body.text).toContain("own milk");
    expect(body.text).toContain("formula");
  });
});

describe("Telegram bot — /last command", () => {
  beforeEach(() => vi.clearAllMocks());

  it("/last returns last status for both children (with empty data)", async () => {
    await handleWebhookUpdate(makeUpdate("/last"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Last status");
    expect(body.text).toContain("Nica");
    expect(body.text).toContain("Nici");
  });

  it("/last nica returns last status for Nica only (child filter)", async () => {
    await handleWebhookUpdate(makeUpdate("/last nica"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Last status");
    expect(body.text).toContain("Nica");
    expect(body.text).not.toContain("Nici");
  });

  it("/last nici returns last status for Nici only (child filter)", async () => {
    await handleWebhookUpdate(makeUpdate("/last nici"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Last status");
    expect(body.text).toContain("Nici");
    expect(body.text).not.toContain("Nica");
  });

  it("/help shows /last nica|nici syntax", async () => {
    await handleWebhookUpdate(makeUpdate("/help", "en"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("/last nica");
    expect(body.text).toContain("/last nici");
  });
});

describe("Telegram bot — /log date prefix", () => {
  beforeEach(() => vi.clearAllMocks());

  it("/log with DD.MM date prefix — reaches db (not unknown child)", async () => {
    await handleWebhookUpdate(makeUpdate("/log 19.03 nica left 14:00-14:10"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    // Should NOT say unknown child — date was correctly stripped
    expect(body.text).not.toContain("Unknown child");
    // Should hit DB (db unavailable since mocked)
    expect(body.text).toContain("Database not available");
  });

  it("/log with DD.MM.YYYY date prefix — reaches db", async () => {
    await handleWebhookUpdate(makeUpdate("/log 19.03.2026 nici right 14:00-14:15"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).not.toContain("Unknown child");
    expect(body.text).toContain("Database not available");
  });

  it("/log without date prefix — still works (defaults to today)", async () => {
    await handleWebhookUpdate(makeUpdate("/log nica left 14:00-14:10"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).not.toContain("Unknown child");
    expect(body.text).toContain("Database not available");
  });

  it("/log with date prefix and both children — reaches db", async () => {
    await handleWebhookUpdate(makeUpdate("/log 20.03 both diaper wet"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).not.toContain("Unknown child");
    expect(body.text).toContain("Database not available");
  });

  it("/help shows date prefix syntax", async () => {
    await handleWebhookUpdate(makeUpdate("/help", "en"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("DD.MM");
    expect(body.text).toContain("backfill");
  });
});

// ─── normalizeVoiceTranscription regression tests ────────────────────────────

describe("normalizeVoiceTranscription — Whisper punctuation and mis-transcriptions", () => {
  // Root cause: Whisper always appends trailing punctuation (period, exclamation, etc.)
  // which caused the command switch to fall through to the "unknown command" default.

  it("strips trailing period from 'Last.'", () => {
    expect(normalizeVoiceTranscription("Last.")).toBe("/last");
  });

  it("strips trailing exclamation from 'Last!'", () => {
    expect(normalizeVoiceTranscription("Last!")).toBe("/last");
  });

  it("strips trailing period from 'Today.'", () => {
    expect(normalizeVoiceTranscription("Today.")).toBe("/today");
  });

  it("strips trailing period from 'Help.'", () => {
    expect(normalizeVoiceTranscription("Help.")).toBe("/help");
  });

  it("strips trailing period from 'Week.'", () => {
    expect(normalizeVoiceTranscription("Week.")).toBe("/week");
  });

  it("normalizes 'Status.' → /last", () => {
    expect(normalizeVoiceTranscription("Status.")).toBe("/last");
  });

  it("normalizes 'Lock nica left 9 to 9:30.' → /log nica left 9-9:30", () => {
    expect(normalizeVoiceTranscription("Lock nica left 9 to 9:30.")).toBe("/log nica left 9-9:30");
  });

  it("normalizes 'Log nica left 9 to 9:30.' → /log nica left 9-9:30", () => {
    expect(normalizeVoiceTranscription("Log nica left 9 to 9:30.")).toBe("/log nica left 9-9:30");
  });

  it("normalizes German 'Heute.' → /today", () => {
    expect(normalizeVoiceTranscription("Heute.")).toBe("/today");
  });

  it("normalizes German 'Letzte.' → /last", () => {
    expect(normalizeVoiceTranscription("Letzte.")).toBe("/last");
  });

  it("normalizes German 'Letzter.' → /last", () => {
    expect(normalizeVoiceTranscription("Letzter.")).toBe("/last");
  });

  it("normalizes German 'Woche.' → /week", () => {
    expect(normalizeVoiceTranscription("Woche.")).toBe("/week");
  });

  it("normalizes German 'Hilfe.' → /help", () => {
    expect(normalizeVoiceTranscription("Hilfe.")).toBe("/help");
  });

  it("normalizes 'Log nika diary wet.' → /log nica diaper wet", () => {
    expect(normalizeVoiceTranscription("Log nika diary wet.")).toBe("/log nica diaper wet");
  });

  it("handles already-clean input without slash", () => {
    expect(normalizeVoiceTranscription("last")).toBe("/last");
  });

  it("handles input with leading slash", () => {
    expect(normalizeVoiceTranscription("/last")).toBe("/last");
  });
});

describe("Telegram bot — /snooze", () => {
  beforeEach(() => vi.clearAllMocks());

  it("/snooze 2h — confirms snooze for 2 hours", async () => {
    await handleWebhookUpdate(makeUpdate("/snooze 2h", "en"));
    expect(mockedAxios).toHaveBeenCalledOnce();
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("2h");
    expect(body.text).toContain("snooze off");
  });

  it("/snooze 30m — confirms snooze for 30 minutes", async () => {
    await handleWebhookUpdate(makeUpdate("/snooze 30m", "en"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("30m");
  });

  it("/snooze 1h30m — confirms combined duration", async () => {
    await handleWebhookUpdate(makeUpdate("/snooze 1h30m", "en"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("1h 30m");
  });

  it("/snooze off — cancels snooze", async () => {
    await handleWebhookUpdate(makeUpdate("/snooze off", "en"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("cancelled");
  });

  it("/snooze (no args) — shows status when not snoozed", async () => {
    // First cancel any active snooze from previous tests
    await handleWebhookUpdate(makeUpdate("/snooze off", "en"));
    vi.clearAllMocks();
    await handleWebhookUpdate(makeUpdate("/snooze", "en"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("active");
  });

  it("/snooze invalid — shows usage hint", async () => {
    await handleWebhookUpdate(makeUpdate("/snooze xyz", "en"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("Usage");
  });

  it("/snooze 2h in German — responds in German", async () => {
    await handleWebhookUpdate(makeUpdate("/snooze 2h", "de"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("stummgeschaltet");
  });

  it("/snooze off in German — responds in German", async () => {
    await handleWebhookUpdate(makeUpdate("/snooze off", "de"));
    const body = mockedAxios.mock.calls[0][1] as { text: string };
    expect(body.text).toContain("beendet");
  });
});
