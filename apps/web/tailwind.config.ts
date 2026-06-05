import type { Config } from "tailwindcss";

// Warm BEIGE palette + gamified (Duolingo-style) chunky 3D feel. Color KEY names are kept
// stable so components don't churn; only the hex values are warm now. "green" = a warm
// olive (primary/correct), "cardinal" = terracotta (wrong), accent = saffron (dots/stars).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: "#FBF6EC", // warm paper instead of pure white (cards/buttons)
        bone: "#F2EADB", // page background
        polar: "#EAE0CD", // recessed sections
        paper: "#FBF6EC",

        green: { DEFAULT: "#7FA03F", dark: "#5F7B26", light: "#E9EAC8" }, // primary / correct
        cardinal: { DEFAULT: "#C25A2E", dark: "#9C4522", light: "#F3E1D4" }, // wrong
        blue: { DEFAULT: "#A87C4F", dark: "#87603A", light: "#EFE2CE" }, // warm secondary
        accent: { DEFAULT: "#E0962A", dark: "#B9711A", light: "#F6E4C6" }, // saffron — dots/stars
        gold: { DEFAULT: "#E0962A", dark: "#B9711A" },
        fire: { DEFAULT: "#CC7A2E", dark: "#A85F22" },

        // neutrals (warm)
        eel: "#2C2218",
        wolf: "#5B4B3A",
        hare: "#9A8A72",
        swan: "#E0D3BB",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Fredoka", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "16px", "2xl": "20px", "3xl": "28px" },
      keyframes: {
        pop: {
          "0%": { transform: "scale(0.6)", opacity: "0.3" },
          "70%": { transform: "scale(1.12)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "20%,60%": { transform: "translateX(-7px)" },
          "40%,80%": { transform: "translateX(7px)" },
        },
        bounceIn: {
          "0%": { transform: "translateY(16px) scale(0.96)", opacity: "0" },
          "60%": { transform: "translateY(-4px) scale(1.01)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)" },
        },
        slideUp: {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        wiggle: {
          "0%,100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
      },
      animation: {
        pop: "pop 260ms cubic-bezier(0.34,1.56,0.64,1) forwards",
        shake: "shake 400ms ease-in-out",
        bounceIn: "bounceIn 450ms cubic-bezier(0.34,1.56,0.64,1) both",
        slideUp: "slideUp 240ms cubic-bezier(0.22,1,0.36,1) both",
        wiggle: "wiggle 700ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
