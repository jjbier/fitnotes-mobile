import { describe, it, expect, vi, afterEach } from "vitest";
import { generateUUID } from "../utils/uuid.js";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateUUID", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a valid RFC4122 v4 UUID using globalThis.crypto.randomUUID when available", () => {
    const id = generateUUID();
    expect(id).toMatch(UUID_V4_REGEX);
  });

  it("produces unique values across many calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateUUID()));
    expect(ids.size).toBe(1000);
  });

  it("falls back to a manual v4 implementation when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    const id = generateUUID();
    expect(id).toMatch(UUID_V4_REGEX);
  });
});
