import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import { css } from "@emotion/react";

import { ThemeOptions, createTheme } from "@mui/material/styles";

const themeOptions: ThemeOptions & { cssVariables: boolean } = {
  palette: {
    mode: "light",
    primary: {
      main: "#646cff",
    },
    secondary: {
      main: "#f50057",
    },
  },
  cssVariables: true,
};

export const theme = createTheme(themeOptions);

export const globalStyle = css({
  ":root": {
    lineHeight: 1.5,
    fontWeight: 400,
    margin: 0,
    padding: 0,

    colorScheme: "light dark",

    "--main-accent-color": "#646cff",

    backgroundColor: "#242424",

    fontSynthesis: "none",
    textRendering: "optimizeLegibility",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },

  body: {
    margin: 0,
    display: "flex",
    minWidth: "100vw",
    minHeight: "100vh",
  },
});
