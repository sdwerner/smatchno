import { describe, it, expect } from "vitest";
import {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "./errors";

describe("HttpError", () => {
  it("creates an error with the given status code and message", () => {
    const err = new HttpError(500, "Internal error");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe("Internal error");
    expect(err.name).toBe("HttpError");
  });

  it("is throwable and catchable as Error", () => {
    expect(() => {
      throw new HttpError(418, "I'm a teapot");
    }).toThrow("I'm a teapot");
  });
});

describe("BadRequestError", () => {
  it("creates a 400 HttpError", () => {
    const err = BadRequestError("Invalid input");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Invalid input");
  });
});

describe("UnauthorizedError", () => {
  it("creates a 401 HttpError", () => {
    const err = UnauthorizedError("Not logged in");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Not logged in");
  });
});

describe("ForbiddenError", () => {
  it("creates a 403 HttpError", () => {
    const err = ForbiddenError("Access denied");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Access denied");
  });
});

describe("NotFoundError", () => {
  it("creates a 404 HttpError", () => {
    const err = NotFoundError("Not found");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
  });
});
