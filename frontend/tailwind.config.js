/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'ur-bg': '#05070b',
        'ur-card': '#0b111c',
        'ur-border': 'rgba(159,203,255,0.14)',
        'ur-indigo': '#5379ff',
        'ur-cyan': '#68e8ff',
        'ur-purple': '#8b5cff',
        'ur-emerald': '#35e59d',
        'ur-rose': '#ff597d',
        'ur-amber': '#ffc45c',
        'ur-text': '#eef6ff',
        'ur-muted': '#8494a8',
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Share Tech Mono', 'monospace'],
      },
      keyframes: {
        scan: {
          '0%, 38%': { transform: 'translateX(-100%)' },
          '62%, 100%': { transform: 'translateX(100%)' },
        },
        glint: {
          '0%, 45%': { transform: 'translateX(-120%)' },
          '70%, 100%': { transform: 'translateX(120%)' },
        },
        grow: {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        scan: 'scan 8s ease-in-out infinite',
        glint: 'glint 6.3s ease-in-out infinite',
        grow: 'grow 1.1s ease both',
        'fade-up': 'fade-up 0.3s ease',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
    },
  },
  plugins: [],
};
