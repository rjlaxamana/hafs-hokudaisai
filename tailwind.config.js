/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ph-blue': '#0038A8',
        'ph-red': '#CE1126',
        'ph-yellow': '#FCD116',
      }
    },
  },
  plugins: [],
}