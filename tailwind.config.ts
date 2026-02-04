import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        beige: "#F2F1EB",
        gold: "#F9B103",
        dark: "#1C1D1C",
        chart: {
          gmv: "#3B82F6",
          commission: "#10B981",
          conversions: "#F59E0B",
          cvr: "#8B5CF6",
          impressions: "#EC4899",
          clicks: "#06B6D4",
          roi: "#10B981",
          profit: "#3B82F6",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
