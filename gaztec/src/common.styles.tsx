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
  body: {
    margin: 0,
    display: "flex",
    minWidth: "100vw",
    minHeight: "100vh",
    background: "linear-gradient(#f6fbfc, #d8d4e7)"
  },

  "#root": {
    width: "100%",
  }
});
