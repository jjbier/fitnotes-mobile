/**
 * @fitnotes/ui
 *
 * Shared design tokens and type contracts used by both the web (shadcn/ui)
 * and mobile (NativeWind) implementations.
 *
 * Platform-specific component implementations live in their respective apps;
 * this package provides the shared vocabulary.
 */

// ─── Color tokens ─────────────────────────────────────────────────────────────

export const colors = {
  primary: "#6366f1",
  primaryForeground: "#ffffff",
  secondary: "#f1f5f9",
  secondaryForeground: "#0f172a",
  destructive: "#ef4444",
  destructiveForeground: "#ffffff",
  muted: "#f8fafc",
  mutedForeground: "#64748b",
  background: "#ffffff",
  foreground: "#0f172a",
  border: "#e2e8f0",
  ring: "#6366f1",
} as const;

// ─── Spacing scale ────────────────────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    sans: "Inter, system-ui, sans-serif",
    mono: "JetBrains Mono, monospace",
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 36,
  },
} as const;

// ─── Shared prop interfaces ───────────────────────────────────────────────────

export interface ButtonVariantProps {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export interface InputBaseProps {
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}
