import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#081019',
        dusk: '#101a24',
        moss: '#19271f',
        burrow: '#372014',
        moon: '#eef5ff',
        ember: '#f47a55',
        mint: '#6be0b8',
        gold: '#f4cd68',
      },
      boxShadow: {
        glow: '0 0 30px rgba(107, 224, 184, 0.22)',
      },
      backgroundImage: {
        'trail-grid':
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
      },
    },
  },
  plugins: [],
};

export default config;
