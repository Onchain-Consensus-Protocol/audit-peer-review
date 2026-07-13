/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./*.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Orbitron", "sans-serif"],
        mono: ["Space Mono", "monospace"],
        sans: ["Inter", "sans-serif"],
      },
      colors: {
        bg: "var(--bg)",
        border: "var(--border)",
        text: "var(--text)",
        "text-muted": "var(--text-muted)",
        accent: "var(--accent)",
        success: "var(--success)",
        danger: "var(--danger)",
      },
    },
  },
  plugins: [],
};
