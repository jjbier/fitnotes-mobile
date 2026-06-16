/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#6366f1",
        "primary-foreground": "#ffffff",
        secondary: "#f1f5f9",
        muted: "#f8fafc",
        "muted-foreground": "#64748b",
        destructive: "#ef4444",
      },
    },
  },
  plugins: [],
};
