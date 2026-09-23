import tailwindcssAnimate from 'tailwindcss-animate';

const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic design tokens (see src/index.css) — they switch with the theme.
        bg: token('bg'),
        elev: token('elev'),
        elev2: token('elev-2'),
        sunken: token('sunken'),
        ink: token('ink'),
        ink2: token('ink-2'),
        ink3: token('ink-3'),
        brand: token('brand'),
        brand2: token('brand-2'),
        onbrand: token('on-brand'),
        gold: token('gold'),
        gold2: token('gold-2'),
        danger: token('danger'),
        success: token('success'),
        info: token('info'),
        line: 'var(--line)',
        line2: 'var(--line-strong)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        logo: ['Cinzel', 'Georgia', 'serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.06), 0 2px 8px -2px rgba(0,0,0,0.08)',
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        brand: 'var(--shadow-brand)',
        inner: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'brand-grad': 'var(--brand-grad)',
        'brand-text': 'var(--brand-text-grad)',
        'gold-grad': 'linear-gradient(135deg, #F1D9A0 0%, #D2AC5E 45%, #A8842F 100%)',
        'ring-grad': 'conic-gradient(from 210deg, #F1D9A0, #C9A45C, #1B3272, #D2AC5E, #F1D9A0)',
        'live-grad': 'linear-gradient(135deg, #FF5A5F 0%, #E0245E 60%, #B3134B 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        'float-up': {
          '0%': { transform: 'translateY(0) scale(0.6)', opacity: '0' },
          '15%': { opacity: '1' },
          '100%': { transform: 'translateY(-260px) scale(1.25)', opacity: '0' },
        },
        glow: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        marquee: 'marquee 12s linear infinite',
        'float-up': 'float-up 2.4s ease-out forwards',
        glow: 'glow 2.4s ease-in-out infinite',
        'spin-slow': 'spin 6s linear infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
