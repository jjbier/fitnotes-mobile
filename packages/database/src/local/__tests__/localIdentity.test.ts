import { describe, it, expect } from "vitest";
import { createNodeSqlExecutor } from "../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../migrations.js";
import { getOrCreateLocalIdentity, setActiveIdentity } from "../localIdentity.js";

describe("getOrCreateLocalIdentity", () => {
  it("creates a guest identity with a real UUID on first call", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);

    const identity = await getOrCreateLocalIdentity(db);

    expect(identity.isGuest).toBe(true);
    expect(identity.activeUserId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("is idempotent — returns the same identity on subsequent calls", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);

    const first = await getOrCreateLocalIdentity(db);
    const second = await getOrCreateLocalIdentity(db);

    expect(second).toEqual(first);
  });
});

describe("setActiveIdentity", () => {
  it("updates the active identity, e.g. after claiming a real account", async () => {
    const db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    await getOrCreateLocalIdentity(db);

    await setActiveIdentity(db, { activeUserId: "real-user-id", isGuest: false });

    const identity = await getOrCreateLocalIdentity(db);
    expect(identity).toEqual({ activeUserId: "real-user-id", isGuest: false });
  });
});
