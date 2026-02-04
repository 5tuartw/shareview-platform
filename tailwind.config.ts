import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors
        beige: '#F2F1EB',
        gold: '#F9B103',
        dark: '#1C1D1C',
        'brand-dark': '#1C1D1C',
        // Chart colors - consistent across all visualizations
        chart: {
          gmv: '#F9B103',      // Gold
          commission: '#FF6B6B', // Coral red
          conversions: '#4ECDC4', // Turquoise
          cvr: '#95E1D3',      // Light turquoise
          impressions: '#5B6DCD', // Purple-blue
          clicks: '#9B59B6',   // Purple
          roi: '#2ECC71',      // Green
          profit: '#27AE60',   // Dark green
        },
        background: "hsl(0 0% 100%)",
        foreground: "#1C1D1C",
        border: "hsl(220 13% 91%)",
        muted: {
          DEFAULT: "hsl(210 40% 96.1%)",
          foreground: "hsl(215.4 16.3% 46.9%)",
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
