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
  /** Incremento de peso por defecto al ajustar un set, cuando el ejercicio no define el suyo propio (`Exercise.weight_increment`). */
  default_weight_increment: number;
  /** Primer día de la semana en el calendario: 0 = domingo, 1 = lunes. */
  calendar_week_start: 0 | 1;
  /** Al completar un set, selecciona automáticamente el siguiente en vez de dejar la selección donde estaba. */
  auto_select_next_set: boolean;
  /** Activa la generación de PRs (personal records) al completar sets. */
  track_personal_records: boolean;
  /** Marca un set como completo automáticamente al rellenar sus campos (peso/reps/etc.), sin exigir un toque aparte. */
  mark_sets_complete: boolean;
  /** Segundos de descanso por defecto tras completar un set, cuando el ejercicio no define el suyo propio (`Exercise.default_rest_seconds`). */
  default_rest_seconds: number;
  rest_timer_sound_enabled: boolean;
  /** Volumen del sonido del timer de descanso, 0–100. */
  rest_timer_volume: number;
  /** Límite de repeticiones por encima del cual no se calculan PRs estimados (la fórmula de Brzycki pierde precisión con reps altas); `null` = sin límite. */
  estimated_records_rep_limit: number | null;
  /** Muestra el número de sets registrados junto a cada ejercicio en la pantalla de inicio. */
  show_set_count_home: boolean;
  /** ids de categorías ocultas en la navegación (preferencia solo de cliente, sin campo equivalente en la base de datos). */
  hidden_category_ids: string[];
  /** Muestra el panel de detalle del día seleccionado en el calendario. */
  calendar_show_day_panel: boolean;
  /** Muestra puntos de color por categoría en los días del calendario que tienen entrenamiento. */
  calendar_show_category_dots: boolean;
  /** Idioma de la interfaz (i18next). */
  language: "es" | "en";
}

/**
 * Valores por defecto para un usuario/dispositivo sin preferencias guardadas
 * todavía (invitado nuevo o primera hidratación): kg, incremento de 2.5,
 * semana empezando en lunes, 90s de descanso con sonido al 80% de volumen,
 * sin límite de reps para PRs estimados y ninguna categoría oculta.
 */
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
  language: "es",
};
