/**
 * Store Zustand de la pantalla de Progreso: PRs cacheados por ejercicio,
 * objetivos (goals) del usuario y los puntos agregados por día que
 * alimentan los gráficos de progreso.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { calculate1RM } from "../utils/calculations.js";
import type { PersonalRecord } from "../types/index.js";

/** Objetivo de peso/reps que el usuario se ha fijado para un ejercicio. */
interface Goal {
  exerciseId: string;
  targetWeight: number;
  targetReps: number;
}

/**
 * Punto agregado de un día concreto en el gráfico de progreso de un
 * ejercicio: máximos y totales de cada métrica (peso, reps, distancia,
 * tiempo), el 1RM estimado (Brzycki) de ese día y `weightByReps`, el mejor
 * peso levantado para cada número de repeticiones ese día.
 */
export interface ChartPoint {
  date: string;
  maxWeight: number;
  totalVolume: number;
  maxReps: number;
  totalReps: number;
  est1RM: number;
  maxDistance: number;
  maxTime: number;
  totalDistance: number;
  totalTime: number;
  maxSpeed: number;
  bestPace: number;
  weightByReps: Record<number, number>;
}

interface ProgressState {
  /** PRs cacheados, indexados por `exercise_id`. */
  personalRecords: Record<string, PersonalRecord[]>;
  goals: Goal[];
  /** Puntos de gráfico cacheados, indexados por `exercise_id`. */
  chartData: Record<string, ChartPoint[]>;
  isLoading: boolean;
  error: string | null;
}

interface ProgressActions {
  /** Reemplaza el índice completo de PRs, reagrupando la lista dada por `exercise_id`. */
  loadPersonalRecords: (records: PersonalRecord[]) => void;
  /** Añade un PR a la lista del ejercicio correspondiente (no reemplaza ni deduplica). */
  addPersonalRecord: (record: PersonalRecord) => void;
  /** Devuelve el mayor 1RM estimado (fórmula de Brzycki) entre los PRs cacheados del ejercicio; `null` si no hay ninguno. */
  calculateEstimated1RM: (exerciseId: string) => number | null;
  /** Crea o reemplaza (por `exerciseId`) el objetivo del ejercicio. */
  setGoal: (goal: Goal) => void;
  removeGoal: (exerciseId: string) => void;
  /** Reemplaza los puntos de gráfico cacheados de un ejercicio. */
  loadChartData: (exerciseId: string, data: ChartPoint[]) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

type ProgressStore = ProgressState & ProgressActions;

/** Store combinado (estado + acciones) de progreso, con Immer para mutaciones ergonómicas. */

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
