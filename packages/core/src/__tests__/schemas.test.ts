import { describe, it, expect } from "vitest";
import {
  categorySchema,
  exerciseSchema,
  workoutSchema,
  workoutExerciseSchema,
  setSchema,
  personalRecordSchema,
  routineSchema,
  routineDaySchema,
  routineDayExerciseSchema,
  predefinedSetSchema,
  bodyMeasurementSchema,
  bodyMeasurementEntrySchema,
  createExerciseInputSchema,
  createSetInputSchema,
  createRoutineInputSchema,
  createBodyMeasurementEntryInputSchema,
} from "../schemas/index.js";
import { ExerciseType, GoalType } from "../types/index.js";

const UUID = "00000000-0000-0000-0000-000000000001";
const UUID2 = "00000000-0000-0000-0000-000000000002";
const ISO_DT = "2024-06-01T12:00:00.000Z";

// ─── categorySchema ───────────────────────────────────────────────────────────

describe("categorySchema [T0.3]", () => {
  it("parses a valid category", () => {
    const result = categorySchema.safeParse({
      id: UUID,
      name: "Chest",
      color: "#ff0000",
      order_index: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    expect(categorySchema.safeParse({ id: UUID, color: "#ff0000", order_index: 0 }).success).toBe(false);
  });

  it("rejects invalid color format", () => {
    expect(categorySchema.safeParse({ id: UUID, name: "A", color: "red", order_index: 0 }).success).toBe(false);
  });

  it("rejects negative order_index", () => {
    expect(categorySchema.safeParse({ id: UUID, name: "A", color: "#aabbcc", order_index: -1 }).success).toBe(false);
  });
});

// ─── exerciseSchema ───────────────────────────────────────────────────────────

describe("exerciseSchema [T0.3]", () => {
  const valid = {
    id: UUID,
    name: "Bench Press",
    category_id: UUID2,
    type: ExerciseType.WEIGHT_REPS,
    weight_unit: "kg",
    is_favorite: false,
    created_at: ISO_DT,
  };

  it("parses a valid exercise", () => {
    expect(exerciseSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional notes", () => {
    expect(exerciseSchema.safeParse({ ...valid, notes: "Keep back flat" }).success).toBe(true);
  });

  it("rejects invalid ExerciseType", () => {
    expect(exerciseSchema.safeParse({ ...valid, type: "INVALID_TYPE" }).success).toBe(false);
  });

  it("rejects missing name", () => {
    const { name: _, ...rest } = valid;
    expect(exerciseSchema.safeParse(rest).success).toBe(false);
  });
});

// ─── workoutSchema ────────────────────────────────────────────────────────────

describe("workoutSchema [T0.3]", () => {
  it("parses minimal valid workout", () => {
    expect(workoutSchema.safeParse({ id: UUID, date: "2024-06-01" }).success).toBe(true);
  });

  it("rejects invalid date format", () => {
    expect(workoutSchema.safeParse({ id: UUID, date: "01/06/2024" }).success).toBe(false);
  });

  it("accepts optional start_time and end_time", () => {
    expect(workoutSchema.safeParse({ id: UUID, date: "2024-06-01", start_time: ISO_DT, end_time: ISO_DT }).success).toBe(true);
  });
});

// ─── workoutExerciseSchema ────────────────────────────────────────────────────

describe("workoutExerciseSchema [T0.3]", () => {
  it("parses a valid workout exercise", () => {
    expect(workoutExerciseSchema.safeParse({
      id: UUID,
      workout_id: UUID2,
      exercise_id: UUID,
      order_index: 0,
    }).success).toBe(true);
  });

  it("accepts optional group_id", () => {
    expect(workoutExerciseSchema.safeParse({
      id: UUID, workout_id: UUID2, exercise_id: UUID, order_index: 0, group_id: UUID,
    }).success).toBe(true);
  });
});

// ─── setSchema ────────────────────────────────────────────────────────────────

describe("setSchema [T0.3]", () => {
  it("parses minimal valid set", () => {
    expect(setSchema.safeParse({
      id: UUID,
      workout_exercise_id: UUID2,
      is_complete: false,
      order_index: 0,
    }).success).toBe(true);
  });

  it("accepts all optional fields", () => {
    expect(setSchema.safeParse({
      id: UUID,
      workout_exercise_id: UUID2,
      is_complete: true,
      order_index: 0,
      weight: 100,
      reps: 5,
      distance: 10,
      time_seconds: 60,
      comment: "Hard set",
    }).success).toBe(true);
  });

  it("rejects negative weight", () => {
    expect(setSchema.safeParse({
      id: UUID, workout_exercise_id: UUID2, is_complete: false, order_index: 0, weight: -1,
    }).success).toBe(false);
  });
});

// ─── personalRecordSchema ─────────────────────────────────────────────────────

describe("personalRecordSchema [T0.3]", () => {
  it("parses a valid PR", () => {
    expect(personalRecordSchema.safeParse({
      id: UUID,
      exercise_id: UUID2,
      reps: 1,
      weight: 150,
      achieved_at: ISO_DT,
    }).success).toBe(true);
  });
});

// ─── routineSchema ────────────────────────────────────────────────────────────

describe("routineSchema [T0.3]", () => {
  it("parses a valid routine", () => {
    expect(routineSchema.safeParse({ id: UUID, name: "Push Day" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(routineSchema.safeParse({ id: UUID, name: "" }).success).toBe(false);
  });
});

// ─── routineDaySchema ─────────────────────────────────────────────────────────

describe("routineDaySchema [T0.3]", () => {
  it("parses a valid routine day", () => {
    expect(routineDaySchema.safeParse({
      id: UUID, routine_id: UUID2, name: "Monday", order_index: 0,
    }).success).toBe(true);
  });
});

// ─── routineDayExerciseSchema ─────────────────────────────────────────────────

describe("routineDayExerciseSchema [T0.3]", () => {
  it("parses a valid routine day exercise", () => {
    expect(routineDayExerciseSchema.safeParse({
      id: UUID, routine_day_id: UUID2, exercise_id: UUID, order_index: 0,
    }).success).toBe(true);
  });
});

// ─── predefinedSetSchema ──────────────────────────────────────────────────────

describe("predefinedSetSchema [T0.3]", () => {
  it("parses a valid predefined set", () => {
    expect(predefinedSetSchema.safeParse({
      id: UUID, routine_day_exercise_id: UUID2, order_index: 0,
    }).success).toBe(true);
  });
});

// ─── bodyMeasurementSchema ────────────────────────────────────────────────────

describe("bodyMeasurementSchema [T0.3]", () => {
  it("parses a valid body measurement", () => {
    expect(bodyMeasurementSchema.safeParse({
      id: UUID,
      name: "Weight",
      unit: "kg",
      goal_type: GoalType.DECREASE,
      is_enabled: true,
      is_default: true,
    }).success).toBe(true);
  });

  it("rejects invalid goal_type", () => {
    expect(bodyMeasurementSchema.safeParse({
      id: UUID, name: "Weight", unit: "kg", goal_type: "INVALID", is_enabled: true, is_default: true,
    }).success).toBe(false);
  });
});

// ─── bodyMeasurementEntrySchema ───────────────────────────────────────────────

describe("bodyMeasurementEntrySchema [T0.3]", () => {
  it("parses a valid entry", () => {
    expect(bodyMeasurementEntrySchema.safeParse({
      id: UUID, measurement_id: UUID2, value: 80.5, recorded_at: ISO_DT,
    }).success).toBe(true);
  });
});

// ─── Form input schemas ────────────────────────────────────────────────────────

describe("createExerciseInputSchema", () => {
  it("does not require id or created_at", () => {
    expect(createExerciseInputSchema.safeParse({
      name: "Squat",
      category_id: UUID,
      type: ExerciseType.WEIGHT_REPS,
      weight_unit: "kg",
      is_favorite: false,
    }).success).toBe(true);
  });
});

describe("createSetInputSchema", () => {
  it("does not require id", () => {
    expect(createSetInputSchema.safeParse({
      workout_exercise_id: UUID,
      is_complete: false,
      order_index: 0,
    }).success).toBe(true);
  });
});

describe("createRoutineInputSchema", () => {
  it("does not require id", () => {
    expect(createRoutineInputSchema.safeParse({ name: "PPL" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createRoutineInputSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("createBodyMeasurementEntryInputSchema", () => {
  it("does not require id", () => {
    expect(createBodyMeasurementEntryInputSchema.safeParse({
      measurement_id: UUID, value: 75, recorded_at: ISO_DT,
    }).success).toBe(true);
  });
});
