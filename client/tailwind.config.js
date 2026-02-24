/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Ampelfarben
        traffic: {
          green: '#22c55e',
          yellow: '#f59e0b',
          red: '#ef4444',
          gray: '#6b7280',
        },
      },
    },
    minHeight: {
      touch: '44px',
    },
    keyframes: {
      'slide-up': {
        from: { transform: 'translateY(100%)' },
        to: { transform: 'translateY(0)' },
      },
      'fade-in': {
        from: { opacity: '0' },
        to: { opacity: '1' },
      },
    },
    animation: {
      'slide-up': 'slide-up 0.25s ease-out',
      'fade-in': 'fade-in 0.2s ease-out',
    },
  },
  plugins: [],
};
