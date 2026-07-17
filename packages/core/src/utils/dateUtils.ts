/**
 * Utilidades de fecha en español (nunca en inglés — ver bug conocido de
 * `formatWorkoutDate`) para fechas de entrenamiento en formato ISO
 * (YYYY-MM-DD): formateo largo/corto/relativo, rango de semana y
 * agrupación por mes.
 */
import type { Workout } from "../types/index.js";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/** Format a workout date string (YYYY-MM-DD) for display. */
export function formatWorkoutDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const date = new Date(year, month - 1, day);
  const dayName = DAYS[date.getDay()];
  const monthName = MONTHS[date.getMonth()];
  return `${dayName}, ${day} de ${monthName} de ${year}`;
}

/** Returns the Monday–Sunday ISO date strings for the week containing the given date. */
export function getWeekRange(dateStr: string): { start: string; end: string } {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return { start: dateStr, end: dateStr };

  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay(); // 0 = Sunday
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return { start: fmt(monday), end: fmt(sunday) };
}

/** Groups workouts by "MMMM YYYY" label. */
export function groupWorkoutsByMonth(
  workouts: Workout[]
): Record<string, Workout[]> {
  const groups: Record<string, Workout[]> = {};

  for (const workout of workouts) {
    const [year, month] = workout.date.split("-").map(Number);
    if (!year || !month) continue;
    const monthName = MONTHS[month - 1]!;
    const key = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(workout);
  }

  return groups;
}

/** Returns today's date as an ISO date string (YYYY-MM-DD). */
export function todayISO(): string {
  return new Date().toISOString().split("T")[0]!;
}

/** Returns the number of days between two ISO date strings. */
export function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000;
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / msPerDay
  );
}

/** Formats a date string (YYYY-MM-DD) as "lunes, 7 de julio de 2026". */
export function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/** Formats a date string as "Hoy" / "Ayer" / "Hace N días" / "dd/mm/yyyy". */
export function formatLastUsedLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Formats an ISO date string as a short date, e.g. "7 jul 2026". */
export function formatShortDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Formats an ISO date string as a relative label: "hoy" / "ayer" / "hace N días" / "hace N sem" / "hace N mes" / "hace N año". */
export function formatDaysAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso + "T12:00:00").getTime()) / 86400000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "ayer";
  if (diff < 7) return `hace ${diff} días`;
  if (diff < 30) return `hace ${Math.floor(diff / 7)} sem`;
  if (diff < 365) return `hace ${Math.floor(diff / 30)} mes`;
  return `hace ${Math.floor(diff / 365)} año`;
}

/**
 * Etiqueta la franja horaria de un `Workout.start_time` (ISO datetime completo, en
 * hora local) para distinguir de un vistazo varios entrenamientos del mismo día — ver
 * docs/implementation-plan-multi-workout-per-day.md, Fase 7. "Sin hora" si no hay
 * `start_time` o no es parseable (workouts creados antes de que se empezara a rellenar
 * de forma fiable, o filas sincronizadas sin ese dato).
 */
export function labelWorkoutByTime(startTime?: string | null): string {
  if (!startTime) return "Sin hora";
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return "Sin hora";
  const hour = date.getHours();
  if (hour >= 5 && hour < 14) return "Mañana";
  if (hour >= 14 && hour < 21) return "Tarde";
  return "Noche";
}
