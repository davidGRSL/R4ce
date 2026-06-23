/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink:        '#0a0a0a',
        paper:      '#fafaf7',
        rally:      '#e63946',     // rojo rally
        track:      '#1a1a1a',
        dust:       '#d4cfc2',
        signal:     '#fcbf49',     // amarillo señal
        forest:     '#386641',     // verde para podio
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
