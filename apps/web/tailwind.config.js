/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dispatch: {
          red: '#DC2626',
          navy: '#1E293B',
          green: '#059669',
          blue: '#2563EB',
          amber: '#D97706',
          purple: '#7C3AED',
          cyan: '#0891B2',
          orange: '#F59E0B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
