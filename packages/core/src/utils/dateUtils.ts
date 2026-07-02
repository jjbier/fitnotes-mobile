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
