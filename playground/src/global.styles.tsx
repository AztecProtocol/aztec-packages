import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';

import { css } from '@mui/styled-engine';

import { type ThemeOptions, createTheme } from '@mui/material/styles';

const themeOptions: ThemeOptions & { cssVariables: boolean } = {
  palette: {
    mode: 'light',
    primary: {
      main: '#9894FF',
      light: '#CDD1D5',
    },
    secondary: {
      main: '#f50057',
    },
  },
  typography: {
    fontFamily: '"Space Grotesk", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 500,
    },
    h2: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 500,
    },
    h5: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
    },
    button: {
      fontFamily: '"Inter", sans-serif',
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
        },
        contained: {
          backgroundColor: '#CDD1D5',
          color: '#000000',
          '&.Mui-disabled': {
            backgroundColor: '#CDD1D5',
            color: 'rgba(0, 0, 0, 0.38)',
          },
          '&:hover': {
            backgroundColor: '#ffffff',
          },
        },
        containedPrimary: {
          backgroundColor: '#9894FF',
          color: '#FFFFFF',
          '&:hover': {
            backgroundColor: '#8985FF',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: '10px',
        },
      },
    },
  },
  cssVariables: true,
};

export const theme = createTheme(themeOptions);

export const globalStyle = css({
  body: {
    margin: 0,
    display: 'flex',
    minWidth: '100vw',
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #9894FF 0%,rgb(210, 205, 213) 100%) fixed',
    fontFamily: '"Space Grotesk", "Roboto", "Helvetica", "Arial", sans-serif',
  },

  '#root': {
    width: '100%',
    height: '100vh',
  },
});
