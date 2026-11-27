import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // High-Velocity Quick-Commerce Storefront Palette
        surface: '#F5F5F4',
        coral: '#E63946',
        'coral-dark': '#D62839',
        fresh: '#2A9D8F',
        ink: '#1C1917',
        muted: '#57534E',
        // Operations / Admin Dashboard Palette
        cream: '#FAF6F0',
        parchment: '#F3EBDF',
        espresso: '#2C1E1A',
        cocoa: '#5C4338',
        terracotta: '#C4622D',
        'terracotta-dark': '#A34D20',
        sage: '#4F6F52',
        wheat: '#E6D5BE',
      },
      fontFamily: {
        sans: [
          'Inter',
          '"DM Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
