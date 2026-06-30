import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { BodyMeasurement, BodyMeasurementEntry } from "../types/index.js";

interface BodyTrackerState {
  measurements: BodyMeasurement[];
  latestEntries: Record<string, BodyMeasurementEntry>;
  chartData: Record<string, BodyMeasurementEntry[]>;
  isLoading: boolean;
  error: string | null;
}

interface BodyTrackerActions {
  loadMeasurements: (measurements: BodyMeasurement[]) => void;
  addMeasurement: (m: BodyMeasurement) => void;
  updateMeasurement: (id: string, updates: Partial<BodyMeasurement>) => void;
  deleteMeasurement: (id: string) => void;
  setLatestEntry: (entry: BodyMeasurementEntry) => void;
  loadChartData: (measurementId: string, entries: BodyMeasurementEntry[]) => void;
  addEntry: (entry: BodyMeasurementEntry) => void;
  deleteEntry: (id: string, measurementId: string) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

type BodyTrackerStore = BodyTrackerState & BodyTrackerActions;

export const useBodyTrackerStore = create<BodyTrackerStore>()(
  immer((set) => ({
    measurements: [],
    latestEntries: {},
    chartData: {},
    isLoading: false,
    error: null,

    loadMeasurements: (measurements) =>
      set((state) => { state.measurements = measurements; }),

    addMeasurement: (m) =>
      set((state) => { state.measurements.push(m); }),

    updateMeasurement: (id, updates) =>
      set((state) => {
        const idx = state.measurements.findIndex((m) => m.id === id);
        if (idx !== -1) Object.assign(state.measurements[idx]!, updates);
      }),

    deleteMeasurement: (id) =>
      set((state) => {
        state.measurements = state.measurements.filter((m) => m.id !== id);
        delete state.latestEntries[id];
        delete state.chartData[id];
      }),

    setLatestEntry: (entry) =>
      set((state) => { state.latestEntries[entry.measurement_id] = entry; }),

    loadChartData: (measurementId, entries) =>
      set((state) => { state.chartData[measurementId] = entries; }),

    addEntry: (entry) =>
      set((state) => {
        state.latestEntries[entry.measurement_id] = entry;
        if (state.chartData[entry.measurement_id]) {
          state.chartData[entry.measurement_id]!.push(entry);
        }
      }),

    deleteEntry: (id, measurementId) =>
      set((state) => {
        if (state.chartData[measurementId]) {
          state.chartData[measurementId] = state.chartData[measurementId]!.filter((e) => e.id !== id);
        }
        if (state.latestEntries[measurementId]?.id === id) {
          delete state.latestEntries[measurementId];
        }
      }),

    setLoading: (v) => set((state) => { state.isLoading = v; }),
    setError: (v) => set((state) => { state.error = v; }),
  }))
);
