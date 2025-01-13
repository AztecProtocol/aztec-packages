import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import { css } from "@emotion/react";

export const globalStyle = css({
  ":root": {
    fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
    lineHeight: 1.5,
    fontWeight: 400,
    margin: 0,
    padding: 0,

    colorScheme: "light dark",
    "--main-text-color": "rgba(255, 255, 255, 0.87)",
    color: "var(--main-text-color)",

    "--main-accent-color": "#646cff",

    backgroundColor: "#242424",

    fontSynthesis: "none",
    textRendering: "optimizeLegibility",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },

  a: {
    fontWeight: 500,
    color: "#646cff",
    textDecoration: "inherit",
  },
  "a:hover": {
    color: "#535bf2",
  },

  body: {
    margin: 0,
    display: "flex",
    minWidth: "100vw",
    minHeight: "100vh",
  },

  h1: {
    fontSize: "3.2em",
    lineHeight: 1.1,
  },
});
