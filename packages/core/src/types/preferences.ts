/**
 * Preferencias de usuario — antes solo vivían en `user_metadata` de Supabase
 * (requerían cuenta real). Ahora tienen un fallback local (SQLite, mobile)
 * que funciona también en modo invitado; `user_metadata` sigue existiendo
 * como mecanismo de sincronización entre dispositivos para cuentas reales.
 */
export interface UserPreferences {
  theme_preference: "light" | "dark" | "system";
  display_name: string;
  weight_unit: "kg" | "lb";
  default_weight_increment: number;
  calendar_week_start: 0 | 1;
  auto_select_next_set: boolean;
  track_personal_records: boolean;
  mark_sets_complete: boolean;
  default_rest_seconds: number;
  rest_timer_sound_enabled: boolean;
  rest_timer_volume: number;
  estimated_records_rep_limit: number | null;
  show_set_count_home: boolean;
  hidden_category_ids: string[];
  calendar_show_day_panel: boolean;
  calendar_show_category_dots: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme_preference: "system",
  display_name: "",
  weight_unit: "kg",
  default_weight_increment: 2.5,
  calendar_week_start: 1,
  auto_select_next_set: true,
  track_personal_records: true,
  mark_sets_complete: true,
  default_rest_seconds: 90,
  rest_timer_sound_enabled: true,
  rest_timer_volume: 80,
  estimated_records_rep_limit: null,
  show_set_count_home: true,
  hidden_category_ids: [],
  calendar_show_day_panel: true,
  calendar_show_category_dots: true,
};
