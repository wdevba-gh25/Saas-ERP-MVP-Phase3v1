/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  safelist: [
    "card",
    "input",
    "btn-primary",
    "btn-secondary",
    "link"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}