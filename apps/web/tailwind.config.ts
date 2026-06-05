import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // warm editorial palette — paper & ink with a saffron accent
        bone: "#F4EEE1", // page
        bone2: "#EBE2D0", // raised panels
        paper: "#FBF7EE", // lightest cards
        ink: "#211A15", // primary text / dark
        ink2: "#4A3F36", // secondary dark
        line: "#DCCFB8", // hairlines on paper
        muted: "#8C7F6A", // muted text
        saffron: "#E0962A", // the accent — a raised, lit braille dot
        saffronDeep: "#B9711A",
        clay: "#B6552F", // secondary warm (sparing)
      },
      fontFamily: {
        display: ["var(--font-display)", "Fraunces", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        dot: "0 6px 14px -4px rgba(185,113,26,0.55), 0 2px 4px -1px rgba(33,26,21,0.25)",
        hole: "inset 0 3px 6px rgba(33,26,21,0.22), inset 0 -1px 2px rgba(255,255,255,0.5)",
        card: "0 1px 2px rgba(33,26,21,0.04), 0 12px 40px -12px rgba(33,26,21,0.18)",
      },
      keyframes: {
        rise: {
          "0%": { transform: "translateY(0) scale(0.82)", opacity: "0.4" },
          "100%": { transform: "translateY(-2px) scale(1)", opacity: "1" },
        },
        breathe: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(0.94)" },
        },
        floatUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        rise: "rise 220ms cubic-bezier(0.34,1.56,0.64,1) forwards",
        breathe: "breathe 1.6s ease-in-out infinite",
        floatUp: "floatUp 700ms cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};
export default config;
