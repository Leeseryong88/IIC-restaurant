/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "#111111",
          light: "#FFFFFF",
          gray: "#F5F5F5",
        }
      },
    },
  },
  plugins: [],
}
