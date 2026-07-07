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
        // Tema carbono: "paper" es ahora el fondo oscuro y "ink" el texto claro.
        // Toda la app usa estos nombres semánticos, así que el tema se
        // propaga automáticamente.
        ink:        '#f2f1ec',     // texto claro
        paper:      '#121212',     // fondo carbono
        carbon:     '#0b0b0b',     // paneles aún más oscuros (nav)
        rally:      '#e63946',     // rojo rally
        track:      '#1c1c1c',
        dust:       '#2e2c28',
        signal:     '#fcbf49',     // amarillo señal
        forest:     '#4c9159',     // verde podio (subido para fondo oscuro)
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
