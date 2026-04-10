import { describe, it, expect } from "vitest";
import { getSessionCookieOptions } from "./cookies";
import type { Request } from "express";

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    protocol: "http",
    headers: {},
    hostname: "localhost",
    ...overrides,
  } as unknown as Request;
}

describe("getSessionCookieOptions", () => {
  it("returns httpOnly, path /, sameSite none", () => {
    const opts = getSessionCookieOptions(makeReq());
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe("/");
    expect(opts.sameSite).toBe("none");
  });

  it("returns secure=false for plain HTTP request", () => {
    const opts = getSessionCookieOptions(makeReq({ protocol: "http" }));
    expect(opts.secure).toBe(false);
  });

  it("returns secure=true for HTTPS request", () => {
    const opts = getSessionCookieOptions(makeReq({ protocol: "https" }));
    expect(opts.secure).toBe(true);
  });

  it("returns secure=true when x-forwarded-proto is https", () => {
    const opts = getSessionCookieOptions(
      makeReq({
        protocol: "http",
        headers: { "x-forwarded-proto": "https" },
      })
    );
    expect(opts.secure).toBe(true);
  });

  it("returns secure=true when x-forwarded-proto contains https in a list", () => {
    const opts = getSessionCookieOptions(
      makeReq({
        protocol: "http",
        headers: { "x-forwarded-proto": "http, https" },
      })
    );
    expect(opts.secure).toBe(true);
  });

  it("returns secure=false when x-forwarded-proto is http only", () => {
    const opts = getSessionCookieOptions(
      makeReq({
        protocol: "http",
        headers: { "x-forwarded-proto": "http" },
      })
    );
    expect(opts.secure).toBe(false);
  });

  it("handles x-forwarded-proto as array", () => {
    const opts = getSessionCookieOptions(
      makeReq({
        protocol: "http",
        headers: { "x-forwarded-proto": ["https"] as unknown as string },
      })
    );
    expect(opts.secure).toBe(true);
  });
});
