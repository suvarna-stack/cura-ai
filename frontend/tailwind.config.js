/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // SuperAdmin palette — light base + medical-green accent
        "admin-accent": "#16a34a",
        "admin-bg": "#f8fafc",
        "admin-card": "#ffffff",
        "admin-border": "#e2e8f0",
        "admin-text": "#0f172a",
        "admin-muted": "#64748b",
      },
    },
  },
  plugins: [],
};
