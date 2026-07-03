import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { DEFAULT_PREFERENCES, type UserPreferences } from "../types/preferences.js";

interface PreferencesState {
  preferences: UserPreferences;
  loaded: boolean;
}

interface PreferencesActions {
  loadPreferences: (prefs: Partial<UserPreferences>) => void;
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
}

type PreferencesStore = PreferencesState & PreferencesActions;

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
