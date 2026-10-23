/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        craft: {
          surface: '#0d1117',
          card: '#131822',
          cardHover: '#18202e',
          borderSubtle: 'rgba(255, 255, 255, 0.07)',
          borderStrong: 'rgba(255, 255, 255, 0.14)',
          innerBevel: 'rgba(255, 255, 255, 0.08)',
        },
      },
      boxShadow: {
        'tactile': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 4px 12px -2px rgba(0, 0, 0, 0.3)',
        'tactile-hover': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.14), 0 2px 6px 0 rgba(0, 0, 0, 0.45), 0 8px 20px -3px rgba(0, 0, 0, 0.4)',
        'inner-bevel': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'glow-blue': '0 0 16px -2px rgba(59, 130, 246, 0.25)',
        'glow-emerald': '0 0 16px -2px rgba(16, 185, 129, 0.25)',
      },
      transitionTimingFunction: {
        'craft': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
