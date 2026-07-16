/**
 * Store Zustand de las preferencias de usuario (tema, unidades, timer de
 * descanso, calendario, etc.). Empieza con `DEFAULT_PREFERENCES` hasta que
 * `loadPreferences` hidrata desde el repositorio correspondiente (local
 * SQLite en mobile, o `user_metadata`/tabla remota).
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { DEFAULT_PREFERENCES, type UserPreferences } from "../types/preferences.js";

interface PreferencesState {
  preferences: UserPreferences;
  /** true tras la primera llamada a `loadPreferences` — distingue "aún no hidratado" de "hidratado con los valores por defecto". */
  loaded: boolean;
}

interface PreferencesActions {
  /** Mergea (`Object.assign`) un subconjunto de preferencias sobre las actuales y marca `loaded = true`. */
  loadPreferences: (prefs: Partial<UserPreferences>) => void;
  /** Actualiza una única preferencia por clave. Optimista: no persiste por sí sola, el caller es responsable de escribirla en el repositorio. */
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
}

type PreferencesStore = PreferencesState & PreferencesActions;

/** Store combinado (estado + acciones) de preferencias de usuario, con Immer para mutaciones ergonómicas. */
export const usePreferencesStore = create<PreferencesStore>()(
  immer((set) => ({
    preferences: DEFAULT_PREFERENCES,
    loaded: false,

    loadPreferences: (prefs) =>
      set((state) => {
        Object.assign(state.preferences, prefs);
        state.loaded = true;
      }),

    setPreference: (key, value) =>
      set((state) => {
        state.preferences[key] = value;
      }),
  }))
);
