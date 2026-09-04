/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gov: {
          navy: "#0f172a",
          dark: "#1e293b",
          blue: "#2563eb",
          saffron: "#f59e0b",
          green: "#10b981",
          red: "#ef4444"
        }
      }
    },
  },
  plugins: [],
}
