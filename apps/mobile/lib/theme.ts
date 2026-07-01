import { useColorScheme } from "react-native";
import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeModeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeModeStore = create<ThemeModeState>((set) => ({
  mode: "system",
  setMode: (mode) => set({ mode }),
}));

export const Colors = {
  light: {
    // Backgrounds
    background: "#fff",
    backgroundAlt: "#f8fafc",
    surface: "#f1f5f9",
    surfaceCard: "#fff",
    surfaceMuted: "#f8fafc",
    // Borders
    border: "#e2e8f0",
    borderLight: "#f1f5f9",
    // Text
    text: "#0f172a",
    textSecondary: "#64748b",
    textMuted: "#94a3b8",
    textDisabled: "#cbd5e1",
    textLabel: "#374151",
    // Primary accent
    primary: "#6366f1",
    primaryLight: "#6366f115",
    primaryBg: "#ede9fe",
    // Success / green
    success: "#22c55e",
    successBg: "#f0fff4",
    successBgStrong: "#dcfce7",
    // Danger / red
    danger: "#ef4444",
    dangerBg: "#fef2f2",
    // Warning / orange
    warning: "#f97316",
    warningBg: "#fff7ed",
    // Info / blue
    info: "#3b82f6",
    infoBg: "#eff6ff",
    // Yellow
    yellow: "#eab308",
    yellowBg: "#fefce8",
    // Timer states
    timerActiveBg: "#f0f0ff",
    timerFinishedBg: "#f0fff4",
    // Misc
    overlay: "rgba(0,0,0,0.5)",
    skeletonBase: "#e2e8f0",
    inputBg: "#f8fafc",
    warmupBadge: "#fef3c7",
    warmupText: "#d97706",
    prBadge: "#fef3c7",
    prText: "#d97706",
    streakBg: "#fff7ed",
    streakText: "#f97316",
    tagBg: "#f1f5f9",
    tagText: "#64748b",
    groupBarColor: "#6366f1",
  },
  dark: {
    // Backgrounds
    background: "#0f172a",
    backgroundAlt: "#1e293b",
    surface: "#1e293b",
    surfaceCard: "#1e293b",
    surfaceMuted: "#0f172a",
    // Borders
    border: "#334155",
    borderLight: "#1e293b",
    // Text
    text: "#f1f5f9",
    textSecondary: "#94a3b8",
    textMuted: "#64748b",
    textDisabled: "#475569",
    textLabel: "#cbd5e1",
    // Primary accent
    primary: "#818cf8",
    primaryLight: "#818cf815",
    primaryBg: "#312e81",
    // Success / green
    success: "#4ade80",
    successBg: "#052e16",
    successBgStrong: "#14532d",
    // Danger / red
    danger: "#f87171",
    dangerBg: "#1c0a0a",
    // Warning / orange
    warning: "#fb923c",
    warningBg: "#1c0f06",
    // Info / blue
    info: "#60a5fa",
    infoBg: "#0c1a2e",
    // Yellow
    yellow: "#facc15",
    yellowBg: "#1c1806",
    // Timer states
    timerActiveBg: "#1a1a3e",
    timerFinishedBg: "#052e16",
    // Misc
    overlay: "rgba(0,0,0,0.7)",
    skeletonBase: "#334155",
    inputBg: "#1e293b",
    warmupBadge: "#292218",
    warmupText: "#fbbf24",
    prBadge: "#292218",
    prText: "#fbbf24",
    streakBg: "#1c0f06",
    streakText: "#fb923c",
    tagBg: "#1e293b",
    tagText: "#94a3b8",
    groupBarColor: "#818cf8",
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };

export function useTheme(): ThemeColors {
  const scheme = useColorScheme();
  const mode = useThemeModeStore((s) => s.mode);
  const resolved = mode === "system" ? scheme : mode;
  return resolved === "dark" ? Colors.dark : Colors.light;
}
