/**
 * Store Zustand del body tracker: mediciones corporales configurables (peso,
 * cintura, etc.) y sus entradas en el tiempo. Cachea aparte la última entrada
 * por medición (`latestEntries`) para que las tarjetas resumen no dependan de
 * que `chartData` esté cargado.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { BodyMeasurement, BodyMeasurementEntry } from "../types/index.js";

interface BodyTrackerState {
  measurements: BodyMeasurement[];
  /** Última entrada conocida por medición, indexada por `measurement_id`. */
  latestEntries: Record<string, BodyMeasurementEntry>;
  /** Historial de entradas cargado para el gráfico de cada medición, indexado por `measurement_id`. */
  chartData: Record<string, BodyMeasurementEntry[]>;
  isLoading: boolean;
  error: string | null;
}

interface BodyTrackerActions {
  /** Reemplaza la lista completa de mediciones (carga inicial). */
  loadMeasurements: (measurements: BodyMeasurement[]) => void;
  /** Añade una medición al final de la lista. */
  addMeasurement: (m: BodyMeasurement) => void;
  /** Mergea (`Object.assign`) un patch parcial sobre la medición con ese id. */
  updateMeasurement: (id: string, updates: Partial<BodyMeasurement>) => void;
  /** Elimina la medición y limpia su entrada cacheada y su historial de gráfico. */
  deleteMeasurement: (id: string) => void;
  /** Actualiza la última entrada conocida para `entry.measurement_id`. */
  setLatestEntry: (entry: BodyMeasurementEntry) => void;
  /** Reemplaza el historial de entradas cacheado de una medición (carga del gráfico). */
  loadChartData: (measurementId: string, entries: BodyMeasurementEntry[]) => void;
  /** Añade una entrada nueva: actualiza `latestEntries` y, si ya hay `chartData` cargado para esa medición, la añade también ahí. */
  addEntry: (entry: BodyMeasurementEntry) => void;
  /** Quita la entrada del `chartData` de la medición; si era la entrada cacheada en `latestEntries`, la borra también de ahí. */
  deleteEntry: (id: string, measurementId: string) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

type BodyTrackerStore = BodyTrackerState & BodyTrackerActions;

/** Store combinado (estado + acciones) del body tracker, con Immer para mutaciones ergonómicas. */
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
