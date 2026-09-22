/**
 * Instancia singleton de i18next para mobile. Los diccionarios (`es`/`en`)
 * viven en `@fitnotes/core` para compartirse con la web; el idioma
 * realmente aplicado es la preferencia persistida (`UserPreferences.language`,
 * SQLite local vía `usePreferencesStore` — ver `_layout.tsx`, que llama a
 * `i18n.changeLanguage()` en cuanto las preferencias terminan de hidratar).
 * Aquí solo se usa el locale del dispositivo (`expo-localization`) como mejor
 * estimación inicial, para evitar un parpadeo en el idioma por defecto antes
 * de que la preferencia real se cargue.
 */
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import { es, en } from "@fitnotes/core";

const deviceLanguage = Localization.getLocales()[0]?.languageCode === "en" ? "en" : "es";

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources: { es, en },
    ns: ["common", "settings", "exercises", "exerciseCatalog", "progress", "bodyTracker", "calendar", "routines", "workout", "search"],
    defaultNS: "common",
    lng: deviceLanguage,
    fallbackLng: "es",
    interpolation: { escapeValue: false },
    compatibilityJSON: "v4",
  });
}

export default i18next;

/**
 * Normaliza `i18n.language` (puede venir como `"es"`, `"es-ES"`, `"en-US"`…
 * según la fuente) al `DateLocale` (`"es" | "en"`) que espera `packages/core`
 * para sus funciones de fecha con `locale` opcional (`formatFullDate`,
 * `formatShortDate`, `formatDaysAgo`, `formatLastUsedLabel`,
 * `labelWorkoutByTime`) — ver `dateUtils.ts` para por qué no se usa
 * directamente ahí (paquete puro, sin `react-i18next`).
 */
export function dateLocale(language: string): "es" | "en" {
  return language.toLowerCase().startsWith("en") ? "en" : "es";
}

/** Tag BCP 47 (`"es-ES"`/`"en-US"`) para pasar directamente a un `toLocaleDateString`/`toLocaleTimeString` inline en un componente, a partir de `i18n.language`. */
export function intlLocale(language: string): string {
  return dateLocale(language) === "en" ? "en-US" : "es-ES";
}
