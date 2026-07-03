import { describe, it, expect } from "vitest";
import { sortPendingOpsForPush } from "../pushOrdering.js";

interface Op {
  table_name: string;
  op_type: "insert" | "update" | "delete";
  row_id: string;
}

describe("sortPendingOpsForPush", () => {
  it("orders inserts/updates parent-first", () => {
    const ops: Op[] = [
      { table_name: "sets", op_type: "insert", row_id: "s1" },
      { table_name: "workouts", op_type: "insert", row_id: "w1" },
      { table_name: "workout_exercises", op_type: "insert", row_id: "we1" },
    ];
    const sorted = sortPendingOpsForPush(ops);
    expect(sorted.map((o) => o.table_name)).toEqual(["workouts", "workout_exercises", "sets"]);
  });

  it("orders deletes child-first", () => {
    const ops: Op[] = [
      { table_name: "workouts", op_type: "delete", row_id: "w1" },
      { table_name: "sets", op_type: "delete", row_id: "s1" },
      { table_name: "workout_exercises", op_type: "delete", row_id: "we1" },
    ];
    const sorted = sortPendingOpsForPush(ops);
    expect(sorted.map((o) => o.table_name)).toEqual(["sets", "workout_exercises", "workouts"]);
  });

  it("preserves original order within the same table (stable sort)", () => {
    const ops: Op[] = [
      { table_name: "sets", op_type: "update", row_id: "s1" },
      { table_name: "sets", op_type: "update", row_id: "s2" },
      { table_name: "sets", op_type: "update", row_id: "s3" },
    ];
    const sorted = sortPendingOpsForPush(ops);
    expect(sorted.map((o) => o.row_id)).toEqual(["s1", "s2", "s3"]);
  });

  it("groups non-deletes before deletes overall", () => {
    const ops: Op[] = [
      { table_name: "sets", op_type: "delete", row_id: "s1" },
      { table_name: "categories", op_type: "insert", row_id: "c1" },
    ];
    const sorted = sortPendingOpsForPush(ops);
    expect(sorted.map((o) => o.op_type)).toEqual(["insert", "delete"]);
  });
});
