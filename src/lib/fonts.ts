import localFont from "next/font/local";

/**
 * Inter (variable, Latin subset) served by Next: self-hosted, preloaded, `font-display: swap`, with a
 * size-adjusted Arial fallback so text does not shift when the font arrives. The file comes from the
 * @fontsource-variable/inter package; globals.css reads it through --font-inter (set on <html>).
 */
export const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  adjustFontFallback: "Arial"
});
