import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_PREFERENCES } from "@fitnotes/core";
import { createNodeSqlExecutor } from "../../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../migrations.js";
import { createLocalPreferencesRepository } from "../localPreferencesRepository.js";
import type { SqlExecutor } from "../../sqlExecutor.js";

describe("localPreferencesRepository", () => {
  let db: SqlExecutor;
  let repo: ReturnType<typeof createLocalPreferencesRepository>;

  beforeEach(async () => {
    db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    repo = createLocalPreferencesRepository(db);
  });

  it("getAll returns the defaults when nothing has been stored yet", async () => {
    const prefs = await repo.getAll();
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
  });

  it("set persists a single key and getAll reflects it, merged with the defaults", async () => {
    await repo.set("weight_unit", "lb");
    const prefs = await repo.getAll();
    expect(prefs.weight_unit).toBe("lb");
    expect(prefs.default_rest_seconds).toBe(DEFAULT_PREFERENCES.default_rest_seconds);
  });

  it("set on an existing key overwrites it instead of duplicating the row", async () => {
    await repo.set("rest_timer_volume", 50);
    await repo.set("rest_timer_volume", 30);
    const rows = await db.getAllAsync<{ key: string }>(
      "SELECT key FROM user_preferences WHERE key = 'rest_timer_volume'"
    );
    expect(rows).toHaveLength(1);
    expect((await repo.getAll()).rest_timer_volume).toBe(30);
  });

  it("set round-trips non-primitive values (arrays, null)", async () => {
    await repo.set("hidden_category_ids", ["a", "b", "c"]);
    await repo.set("estimated_records_rep_limit", null);
    const prefs = await repo.getAll();
    expect(prefs.hidden_category_ids).toEqual(["a", "b", "c"]);
    expect(prefs.estimated_records_rep_limit).toBeNull();
  });

  it("setMany persists several keys atomically", async () => {
    await repo.setMany({ theme_preference: "dark", auto_select_next_set: false, calendar_week_start: 0 });
    const prefs = await repo.getAll();
    expect(prefs.theme_preference).toBe("dark");
    expect(prefs.auto_select_next_set).toBe(false);
    expect(prefs.calendar_week_start).toBe(0);
    expect(prefs.mark_sets_complete).toBe(DEFAULT_PREFERENCES.mark_sets_complete);
  });
});
