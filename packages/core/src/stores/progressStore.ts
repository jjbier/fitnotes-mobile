import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { calculate1RM } from "../utils/calculations.js";
import type { PersonalRecord } from "../types/index.js";

interface Goal {
  exerciseId: string;
  targetWeight: number;
  targetReps: number;
}

interface ProgressState {
  personalRecords: Record<string, PersonalRecord[]>;
  goals: Goal[];
}

interface ProgressActions {
  loadPersonalRecords: (records: PersonalRecord[]) => void;
  addPersonalRecord: (record: PersonalRecord) => void;
  calculateEstimated1RM: (exerciseId: string) => number | null;
  setGoal: (goal: Goal) => void;
  removeGoal: (exerciseId: string) => void;
}

type ProgressStore = ProgressState & ProgressActions;

export const useProgressStore = create<ProgressStore>()(
  immer((set, get) => ({
    personalRecords: {},
    goals: [],

    loadPersonalRecords: (records) =>
      set((state) => {
        state.personalRecords = {};
        for (const record of records) {
          if (!state.personalRecords[record.exercise_id]) {
            state.personalRecords[record.exercise_id] = [];
          }
          state.personalRecords[record.exercise_id]!.push(record);
        }
      }),

    addPersonalRecord: (record) =>
      set((state) => {
        if (!state.personalRecords[record.exercise_id]) {
          state.personalRecords[record.exercise_id] = [];
        }
        state.personalRecords[record.exercise_id]!.push(record);
      }),

    // Brzycki formula: weight * (36 / (37 - reps))
    // Returns the best estimated 1RM across all PRs for the given exercise
    calculateEstimated1RM: (exerciseId) => {
      const records = get().personalRecords[exerciseId];
      if (!records || records.length === 0) return null;
      return Math.max(...records.map((r) => calculate1RM(r.weight, r.reps)));
    },

    setGoal: (goal) =>
      set((state) => {
        const idx = state.goals.findIndex(
          (g) => g.exerciseId === goal.exerciseId
        );
        if (idx !== -1) {
          state.goals[idx] = goal;
        } else {
          state.goals.push(goal);
        }
      }),

    removeGoal: (exerciseId) =>
      set((state) => {
        state.goals = state.goals.filter((g) => g.exerciseId !== exerciseId);
      }),
  }))
);
