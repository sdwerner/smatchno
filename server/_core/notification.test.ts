import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";

// Mock ENV before importing notification module
vi.mock("./env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.example.com/",
    forgeApiKey: "test-api-key",
  },
}));

import { notifyOwner } from "./notification";

describe("notifyOwner", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws BAD_REQUEST when title is empty", async () => {
    await expect(
      notifyOwner({ title: "", content: "Some content" })
    ).rejects.toThrow(TRPCError);

    try {
      await notifyOwner({ title: "", content: "Some content" });
    } catch (e) {
      expect((e as TRPCError).code).toBe("BAD_REQUEST");
      expect((e as TRPCError).message).toContain("title is required");
    }
  });

  it("throws BAD_REQUEST when title is whitespace only", async () => {
    await expect(
      notifyOwner({ title: "   ", content: "Some content" })
    ).rejects.toThrow(TRPCError);
  });

  it("throws BAD_REQUEST when content is empty", async () => {
    await expect(
      notifyOwner({ title: "Test", content: "" })
    ).rejects.toThrow(TRPCError);

    try {
      await notifyOwner({ title: "Test", content: "" });
    } catch (e) {
      expect((e as TRPCError).code).toBe("BAD_REQUEST");
      expect((e as TRPCError).message).toContain("content is required");
    }
  });

  it("throws BAD_REQUEST when title exceeds max length", async () => {
    const longTitle = "a".repeat(1201);
    await expect(
      notifyOwner({ title: longTitle, content: "Some content" })
    ).rejects.toThrow(TRPCError);

    try {
      await notifyOwner({ title: longTitle, content: "Some content" });
    } catch (e) {
      expect((e as TRPCError).code).toBe("BAD_REQUEST");
      expect((e as TRPCError).message).toContain("at most 1200");
    }
  });

  it("throws BAD_REQUEST when content exceeds max length", async () => {
    const longContent = "b".repeat(20001);
    await expect(
      notifyOwner({ title: "Test", content: longContent })
    ).rejects.toThrow(TRPCError);

    try {
      await notifyOwner({ title: "Test", content: longContent });
    } catch (e) {
      expect((e as TRPCError).code).toBe("BAD_REQUEST");
      expect((e as TRPCError).message).toContain("at most 20000");
    }
  });

  it("returns true on successful notification", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await notifyOwner({ title: "Hello", content: "World" });
    expect(result).toBe(true);

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain("webdevtoken.v1.WebDevService/SendNotification");
    expect(fetchCall[1].method).toBe("POST");
    const body = JSON.parse(fetchCall[1].body);
    expect(body.title).toBe("Hello");
    expect(body.content).toBe("World");
  });

  it("returns false when API returns a non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: () => Promise.resolve("server error"),
    });

    const result = await notifyOwner({ title: "Hello", content: "World" });
    expect(result).toBe(false);
  });

  it("returns false when fetch throws a network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    const result = await notifyOwner({ title: "Hello", content: "World" });
    expect(result).toBe(false);
  });

  it("trims title and content before sending", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await notifyOwner({ title: "  Hello  ", content: "  World  " });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.title).toBe("Hello");
    expect(body.content).toBe("World");
  });

  it("accepts title at exactly max length", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const title = "a".repeat(1200);
    const result = await notifyOwner({ title, content: "content" });
    expect(result).toBe(true);
  });
});

describe("notifyOwner — missing config", () => {
  it("throws INTERNAL_SERVER_ERROR when forgeApiUrl is missing", async () => {
    // Dynamically override ENV for this test
    const envModule = await import("./env");
    const originalUrl = envModule.ENV.forgeApiUrl;
    (envModule.ENV as Record<string, unknown>).forgeApiUrl = "";

    try {
      await notifyOwner({ title: "Test", content: "Content" });
    } catch (e) {
      expect((e as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      expect((e as TRPCError).message).toContain("URL is not configured");
    } finally {
      (envModule.ENV as Record<string, unknown>).forgeApiUrl = originalUrl;
    }
  });

  it("throws INTERNAL_SERVER_ERROR when forgeApiKey is missing", async () => {
    const envModule = await import("./env");
    const originalKey = envModule.ENV.forgeApiKey;
    (envModule.ENV as Record<string, unknown>).forgeApiKey = "";

    try {
      await notifyOwner({ title: "Test", content: "Content" });
    } catch (e) {
      expect((e as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      expect((e as TRPCError).message).toContain("API key is not configured");
    } finally {
      (envModule.ENV as Record<string, unknown>).forgeApiKey = originalKey;
    }
  });
});
