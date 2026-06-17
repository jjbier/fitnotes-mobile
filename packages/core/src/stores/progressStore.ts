import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { calculate1RM } from "../utils/calculations.js";
import type { PersonalRecord } from "../types/index.js";

interface Goal {
  exerciseId: string;
  targetWeight: number;
  targetReps: number;
}

export interface ChartPoint {
  date: string;
  maxWeight: number;
  totalVolume: number;
  maxReps: number;
}

interface ProgressState {
  personalRecords: Record<string, PersonalRecord[]>;
  goals: Goal[];
  chartData: Record<string, ChartPoint[]>;
  isLoading: boolean;
  error: string | null;
}

interface ProgressActions {
  loadPersonalRecords: (records: PersonalRecord[]) => void;
  addPersonalRecord: (record: PersonalRecord) => void;
  calculateEstimated1RM: (exerciseId: string) => number | null;
  setGoal: (goal: Goal) => void;
  removeGoal: (exerciseId: string) => void;
  loadChartData: (exerciseId: string, data: ChartPoint[]) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

type ProgressStore = ProgressState & ProgressActions;

export const useProgressStore = create<ProgressStore>()(
  immer((set, get) => ({
    personalRecords: {},
    goals: [],
    chartData: {},
    isLoading: false,
    error: null,

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

    calculateEstimated1RM: (exerciseId) => {
      const records = get().personalRecords[exerciseId];
      if (!records || records.length === 0) return null;
      return Math.max(...records.map((r) => calculate1RM(r.weight, r.reps)));
    },

    setGoal: (goal) =>
      set((state) => {
        const idx = state.goals.findIndex((g) => g.exerciseId === goal.exerciseId);
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

    loadChartData: (exerciseId, data) =>
      set((state) => {
        state.chartData[exerciseId] = data;
      }),

    setLoading: (v) =>
      set((state) => {
        state.isLoading = v;
      }),

    setError: (v) =>
      set((state) => {
        state.error = v;
      }),
  }))
);
