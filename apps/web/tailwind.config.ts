import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-solid': 'var(--surface-solid)',
        ink: 'var(--ink)',
        'ink-muted': 'var(--ink-muted)',
        border: 'var(--border)',
        primary: {
          DEFAULT: 'var(--primary)',
          contrast: 'var(--primary-contrast)',
        },
        focus: 'var(--focus)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        metro: {
          purple: 'var(--metro-purple)',
          aqua: 'var(--metro-aqua)',
        },
        bus: 'var(--bus)',
        auto: 'var(--auto)',
        cab: 'var(--cab)',
        walk: 'var(--walk)',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        input: '12px',
        card: '16px',
        pill: '999px',
      },
      boxShadow: {
        e1: 'var(--e1)',
        e2: 'var(--e2)',
        e3: 'var(--e3)',
      },
    },
  },
  plugins: [],
};

export default config;
