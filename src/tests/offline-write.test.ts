/**
 * Rules for writes an offline till uploads later: which timestamps are trusted, which ids are accepted,
 * and — most important — that a redirected / HTML answer is never mistaken for a successful upload.
 */

import { describe, it, expect, vi } from "vitest";

// offline-write.ts imports the database client; these tests only use its pure helpers.
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { CLIENT_ID, trustedTime } from "@/lib/offline-write";
import { isApiAnswer } from "@/lib/offline/queue";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

describe("trustedTime", () => {
  it("returns undefined when nothing was sent", () => {
    expect(trustedTime(undefined)).toBeUndefined();
  });

  it("keeps a time from a few hours ago (an offline till uploading later)", () => {
    const sent = new Date(Date.now() - 5 * HOUR).toISOString();
    expect(trustedTime(sent)?.toISOString()).toBe(sent);
  });

  it("keeps a time up to 14 days old", () => {
    const sent = new Date(Date.now() - 13 * DAY).toISOString();
    expect(trustedTime(sent)).toBeDefined();
  });

  it("refuses a time older than 14 days (a till with a broken clock)", () => {
    expect(trustedTime(new Date(Date.now() - 15 * DAY).toISOString())).toBeUndefined();
  });

  it("refuses a time far in the future", () => {
    expect(trustedTime(new Date(Date.now() + HOUR).toISOString())).toBeUndefined();
  });

  it("never returns a moment later than now (small clock drift is clamped)", () => {
    const t = trustedTime(new Date(Date.now() + 60_000).toISOString());
    expect(t).toBeDefined();
    expect(t!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("refuses garbage", () => {
    expect(trustedTime("not a date")).toBeUndefined();
  });
});

describe("CLIENT_ID", () => {
  it("accepts a UUID and a cuid", () => {
    expect(CLIENT_ID.test("3f2b8c1e-9d4a-4e6b-8a7c-1d2e3f4a5b6c")).toBe(true);
    expect(CLIENT_ID.test("cmuhzb0tn000001o222q8zflq")).toBe(true);
  });

  it("refuses short, long or odd ids", () => {
    expect(CLIENT_ID.test("abc")).toBe(false);
    expect(CLIENT_ID.test("a".repeat(65))).toBe(false);
    expect(CLIENT_ID.test("id with spaces 1234567890")).toBe(false);
    expect(CLIENT_ID.test("../../etc/passwd-1234567890")).toBe(false);
  });
});

describe("isApiAnswer — a redirect to the sign-in page must never count as an upload", () => {
  function fakeResponse(init: { redirected: boolean; contentType: string | null }): Response {
    return {
      redirected: init.redirected,
      headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? init.contentType : null) },
    } as unknown as Response;
  }

  it("accepts a normal JSON answer", () => {
    expect(isApiAnswer(fakeResponse({ redirected: false, contentType: "application/json" }))).toBe(true);
  });

  it("refuses an answer that was redirected (sent to the sign-in page)", () => {
    expect(isApiAnswer(fakeResponse({ redirected: true, contentType: "text/html; charset=utf-8" }))).toBe(false);
  });

  it("refuses an HTML page even without a redirect", () => {
    expect(isApiAnswer(fakeResponse({ redirected: false, contentType: "text/html" }))).toBe(false);
  });

  it("refuses an answer with no content type", () => {
    expect(isApiAnswer(fakeResponse({ redirected: false, contentType: null }))).toBe(false);
  });
});
