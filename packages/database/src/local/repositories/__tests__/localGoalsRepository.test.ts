import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqlExecutor } from "../../testing/nodeSqlExecutor.js";
import { runLocalMigrations } from "../../migrations.js";
import { createLocalGoalsRepository } from "../localGoalsRepository.js";
import type { SqlExecutor } from "../../sqlExecutor.js";

const USER_ID = "user-1";
const EXERCISE_ID = "exercise-1";

describe("localGoalsRepository", () => {
  let db: SqlExecutor;
  let repo: ReturnType<typeof createLocalGoalsRepository>;

  beforeEach(async () => {
    db = createNodeSqlExecutor();
    await runLocalMigrations(db);
    repo = createLocalGoalsRepository(db);
  });

  it("upsertGoal creates a new goal with a real UUID and queues an insert op", async () => {
    const goal = await repo.upsertGoal({ exercise_id: EXERCISE_ID, target_weight: 100 }, USER_ID);
    expect(goal?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(goal?.target_weight).toBe(100);

    const ops = await db.getAllAsync("SELECT row_id FROM pending_ops WHERE table_name = 'exercise_goals'");
    expect(ops).toEqual([{ row_id: goal!.id }]);
  });

  it("upsertGoal updates the existing goal for (user_id, exercise_id) instead of duplicating it", async () => {
    const first = await repo.upsertGoal({ exercise_id: EXERCISE_ID, target_weight: 100 }, USER_ID);
    const second = await repo.upsertGoal({ exercise_id: EXERCISE_ID, target_weight: 120 }, USER_ID);

    expect(second?.id).toBe(first?.id);
    expect(second?.target_weight).toBe(120);

    const goals = await repo.getGoals();
    expect(goals).toHaveLength(1);
  });

  it("markAchieved sets achieved_at on the goal for that exercise", async () => {
    await repo.upsertGoal({ exercise_id: EXERCISE_ID, target_reps: 10 }, USER_ID);
    await repo.markAchieved(EXERCISE_ID);

    const goals = await repo.getGoals();
    expect(goals[0]?.achieved_at).toBeTruthy();
  });

  it("deleteGoal tombstones the goal so it no longer appears in getGoals", async () => {
    await repo.upsertGoal({ exercise_id: EXERCISE_ID, target_reps: 10 }, USER_ID);
    await repo.deleteGoal(EXERCISE_ID);

    const goals = await repo.getGoals();
    expect(goals).toEqual([]);
  });

  it("deleteGoal on a non-existent exercise is a no-op", async () => {
    await expect(repo.deleteGoal("does-not-exist")).resolves.toEqual({ error: null });
  });
});
