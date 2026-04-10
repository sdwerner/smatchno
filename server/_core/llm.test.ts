import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock ENV before importing llm module
vi.mock("./env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.example.com",
    forgeApiKey: "test-key",
  },
}));

import { invokeLLM } from "./llm";
import type {
  Message,
  Tool,
  InvokeParams,
} from "./llm";

describe("invokeLLM — message normalization", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("normalizes a simple string content message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "1",
          created: 0,
          model: "test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Hello" },
              finish_reason: "stop",
            },
          ],
        }),
    });

    await invokeLLM({
      messages: [{ role: "user", content: "Hello" }],
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.messages[0]).toEqual({ role: "user", content: "Hello" });
  });

  it("normalizes TextContent to a collapsed string", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "1",
          created: 0,
          model: "test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Hi" },
              finish_reason: "stop",
            },
          ],
        }),
    });

    await invokeLLM({
      messages: [
        { role: "user", content: { type: "text", text: "Hello text" } },
      ],
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    // Single text content collapses to string
    expect(body.messages[0].content).toBe("Hello text");
  });

  it("normalizes mixed content (text + image) to array", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "1",
          created: 0,
          model: "test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Described" },
              finish_reason: "stop",
            },
          ],
        }),
    });

    await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this" },
            {
              type: "image_url",
              image_url: { url: "https://example.com/img.png" },
            },
          ],
        },
      ],
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(Array.isArray(body.messages[0].content)).toBe(true);
    expect(body.messages[0].content).toHaveLength(2);
    expect(body.messages[0].content[0].type).toBe("text");
    expect(body.messages[0].content[1].type).toBe("image_url");
  });

  it("normalizes tool/function role messages to string content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "1",
          created: 0,
          model: "test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "OK" },
              finish_reason: "stop",
            },
          ],
        }),
    });

    await invokeLLM({
      messages: [
        {
          role: "tool",
          content: "result text",
          tool_call_id: "call_123",
          name: "my_func",
        },
      ],
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.messages[0].role).toBe("tool");
    expect(typeof body.messages[0].content).toBe("string");
    expect(body.messages[0].tool_call_id).toBe("call_123");
  });
});

describe("invokeLLM — tool choice normalization", () => {
  const originalFetch = globalThis.fetch;
  const mockResponse = {
    ok: true,
    json: () =>
      Promise.resolve({
        id: "1",
        created: 0,
        model: "test",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "" },
            finish_reason: "stop",
          },
        ],
      }),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("passes 'auto' as-is", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const tool: Tool = {
      type: "function",
      function: { name: "test_fn", description: "A test" },
    };

    await invokeLLM({
      messages: [{ role: "user", content: "hi" }],
      tools: [tool],
      toolChoice: "auto",
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.tool_choice).toBe("auto");
  });

  it("passes 'none' as-is", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await invokeLLM({
      messages: [{ role: "user", content: "hi" }],
      toolChoice: "none",
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.tool_choice).toBe("none");
  });

  it("converts 'required' with single tool to explicit format", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const tool: Tool = {
      type: "function",
      function: { name: "my_tool" },
    };

    await invokeLLM({
      messages: [{ role: "user", content: "hi" }],
      tools: [tool],
      toolChoice: "required",
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.tool_choice).toEqual({
      type: "function",
      function: { name: "my_tool" },
    });
  });

  it("throws when 'required' with no tools", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      invokeLLM({
        messages: [{ role: "user", content: "hi" }],
        toolChoice: "required",
      })
    ).rejects.toThrow("no tools were configured");
  });

  it("throws when 'required' with multiple tools", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      invokeLLM({
        messages: [{ role: "user", content: "hi" }],
        tools: [
          { type: "function", function: { name: "a" } },
          { type: "function", function: { name: "b" } },
        ],
        toolChoice: "required",
      })
    ).rejects.toThrow("specify the tool name explicitly");
  });

  it("converts { name } shorthand to explicit format", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await invokeLLM({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "lookup" } }],
      toolChoice: { name: "lookup" },
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.tool_choice).toEqual({
      type: "function",
      function: { name: "lookup" },
    });
  });
});

describe("invokeLLM — response format normalization", () => {
  const originalFetch = globalThis.fetch;
  const mockResponse = {
    ok: true,
    json: () =>
      Promise.resolve({
        id: "1",
        created: 0,
        model: "test",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "{}" },
            finish_reason: "stop",
          },
        ],
      }),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("passes json_schema response format through", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await invokeLLM({
      messages: [{ role: "user", content: "hi" }],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "test_schema",
          schema: { type: "object" },
        },
      },
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("test_schema");
  });

  it("converts outputSchema to json_schema response format", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await invokeLLM({
      messages: [{ role: "user", content: "hi" }],
      outputSchema: {
        name: "my_output",
        schema: { type: "object", properties: {} },
        strict: true,
      },
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "my_output",
        schema: { type: "object", properties: {} },
        strict: true,
      },
    });
  });

  it("throws when json_schema has no schema object", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      invokeLLM({
        messages: [{ role: "user", content: "hi" }],
        responseFormat: {
          type: "json_schema",
          json_schema: { name: "broken", schema: undefined as unknown as Record<string, unknown> },
        },
      })
    ).rejects.toThrow("requires a defined schema object");
  });

  it("throws when outputSchema is missing name or schema", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      invokeLLM({
        messages: [{ role: "user", content: "hi" }],
        outputSchema: {
          name: "",
          schema: { type: "object" },
        },
      })
    ).rejects.toThrow("requires both name and schema");
  });
});

describe("invokeLLM — error handling", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws when API key is missing", async () => {
    const envModule = await import("./env");
    const originalKey = envModule.ENV.forgeApiKey;
    (envModule.ENV as Record<string, unknown>).forgeApiKey = "";

    try {
      await expect(
        invokeLLM({ messages: [{ role: "user", content: "hi" }] })
      ).rejects.toThrow("OPENAI_API_KEY is not configured");
    } finally {
      (envModule.ENV as Record<string, unknown>).forgeApiKey = originalKey;
    }
  });

  it("throws on non-ok API response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: () => Promise.resolve("Rate limited"),
    });

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow("LLM invoke failed: 429");
  });

  it("uses correct API URL from config", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "1",
          created: 0,
          model: "test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "OK" },
              finish_reason: "stop",
            },
          ],
        }),
    });

    await invokeLLM({ messages: [{ role: "user", content: "hi" }] });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("https://forge.example.com/v1/chat/completions");
  });
});
