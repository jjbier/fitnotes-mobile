import { describe, it, expect, beforeEach } from "vitest";
import { usePreferencesStore } from "../stores/preferencesStore.js";
import { DEFAULT_PREFERENCES } from "../types/preferences.js";

beforeEach(() => {
  usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES }, loaded: false });
});

describe("usePreferencesStore", () => {
  it("starts with the default preferences and loaded=false", () => {
    const state = usePreferencesStore.getState();
    expect(state.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(state.loaded).toBe(false);
  });

  it("loadPreferences merges partial data over the current state and marks loaded=true", () => {
    usePreferencesStore.getState().loadPreferences({ weight_unit: "lb", track_personal_records: false });
    const state = usePreferencesStore.getState();
    expect(state.preferences.weight_unit).toBe("lb");
    expect(state.preferences.track_personal_records).toBe(false);
    expect(state.preferences.theme_preference).toBe(DEFAULT_PREFERENCES.theme_preference);
    expect(state.loaded).toBe(true);
  });

  it("setPreference updates a single key without affecting the rest", () => {
    usePreferencesStore.getState().setPreference("default_rest_seconds", 120);
    const state = usePreferencesStore.getState();
    expect(state.preferences.default_rest_seconds).toBe(120);
    expect(state.preferences.default_weight_increment).toBe(DEFAULT_PREFERENCES.default_weight_increment);
  });

  it("setPreference supports array values (hidden_category_ids)", () => {
    usePreferencesStore.getState().setPreference("hidden_category_ids", ["cat-1", "cat-2"]);
    expect(usePreferencesStore.getState().preferences.hidden_category_ids).toEqual(["cat-1", "cat-2"]);
  });
});
