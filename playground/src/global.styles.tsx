import { css } from '@mui/styled-engine';

import { type ThemeOptions, createTheme } from '@mui/material/styles';

import backgroundImage from './assets/background.jpg';

// Design tokens - Single source of truth for all colors and styles
export const designTokens = {
  colors: {
    primary: {
      main: '#D4FF28', // Chartreuse green
      light: '#deff5c',
      dark: '#94b21c',
      contrastText: '#00122E',
    },
    secondary: {
      main: '#a52b9d', // Deep purple/oxblood
      light: '#a62b9d;',
      contrastText: '#F2EEE1',
    },
    background: {
      default: '#000000', // Pure black
      paper: 'rgba(18, 18, 28, 0.85)', // Dark blue-black with transparency
      paperDark: 'rgba(18, 18, 28, 0.95)',
    },
    text: {
      primary: '#F2EEE1', // Light parchment
      secondary: '#D4FF28', // Chartreuse for accents
    },
    glass: {
      dark: 'rgba(0, 0, 0, 0.3)',
      darker: 'rgba(0, 0, 0, 0.4)',
    },
    divider: 'rgba(212, 255, 40, 0.15)',
  },
  borders: {
    light: '1px solid rgba(212, 255, 40, 0.1)',
    normal: '1px solid rgba(212, 255, 40, 0.15)',
    medium: '1px solid rgba(212, 255, 40, 0.2)',
    strong: '1px solid rgba(212, 255, 40, 0.3)',
    veryStrong: '1px solid rgba(212, 255, 40, 0.4)',
    dashed: '3px dashed rgba(212, 255, 40, 0.5)',
    hoverColor: 'rgba(212, 255, 40, 0.25)',
  },
  effects: {
    backdropBlur: 'blur(20px)',
  },
  shape: {
    borderRadius: 0,
  },
};

// Convenient exports for components
export const colors = designTokens.colors;

export const commonStyles = {
  // Glass panel backgrounds
  glassPaper: designTokens.colors.background.paper,
  glassPaperDark: designTokens.colors.background.paperDark,
  glassDark: designTokens.colors.glass.dark,
  glassDarker: designTokens.colors.glass.darker,
  glassVeryDark: 'rgba(0, 0, 0, 0.7)',

  // Borders
  borderLight: designTokens.borders.light,
  borderNormal: designTokens.borders.normal,
  borderMedium: designTokens.borders.medium,
  borderStrong: designTokens.borders.strong,
  borderVeryStrong: designTokens.borders.veryStrong,
  borderDashed: designTokens.borders.dashed,
  borderHover: designTokens.borders.hoverColor,

  // Effects
  backdropBlur: designTokens.effects.backdropBlur,

  // Shape
  borderRadius: designTokens.shape.borderRadius,
};

// Aztec-inspired dark mode color palette
const themeOptions: ThemeOptions & { cssVariables: boolean } = {
  palette: {
    mode: 'dark',
    primary: designTokens.colors.primary,
    secondary: designTokens.colors.secondary,
    background: {
      default: designTokens.colors.background.default,
      paper: designTokens.colors.background.paper,
    },
    text: designTokens.colors.text,
    divider: designTokens.colors.divider,
  },
  typography: {
    fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      fontSize: '2.5rem',
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 700,
      fontSize: '2rem',
      letterSpacing: '-0.01em',
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.75rem',
      letterSpacing: '-0.01em',
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.5rem',
    },
    h5: {
      fontWeight: 500,
      fontSize: '1.25rem',
    },
    h6: {
      fontWeight: 500,
      fontSize: '1rem',
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
      fontWeight: 400,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
      fontWeight: 400,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 0,
  },
  shadows: [
    'none',
    '0px 2px 4px rgba(0, 18, 46, 0.04)',
    '0px 4px 8px rgba(0, 18, 46, 0.06)',
    '0px 8px 16px rgba(0, 18, 46, 0.08)',
    '0px 12px 24px rgba(0, 18, 46, 0.1)',
    '0px 16px 32px rgba(0, 18, 46, 0.12)',
    '0px 20px 40px rgba(0, 18, 46, 0.14)',
    '0px 24px 48px rgba(0, 18, 46, 0.16)',
    '0px 28px 56px rgba(0, 18, 46, 0.18)',
    '0px 32px 64px rgba(0, 18, 46, 0.2)',
    '0px 36px 72px rgba(0, 18, 46, 0.22)',
    '0px 40px 80px rgba(0, 18, 46, 0.24)',
    '0px 44px 88px rgba(0, 18, 46, 0.26)',
    '0px 48px 96px rgba(0, 18, 46, 0.28)',
    '0px 52px 104px rgba(0, 18, 46, 0.3)',
    '0px 56px 112px rgba(0, 18, 46, 0.32)',
    '0px 60px 120px rgba(0, 18, 46, 0.34)',
    '0px 64px 128px rgba(0, 18, 46, 0.36)',
    '0px 68px 136px rgba(0, 18, 46, 0.38)',
    '0px 72px 144px rgba(0, 18, 46, 0.4)',
    '0px 76px 152px rgba(0, 18, 46, 0.42)',
    '0px 80px 160px rgba(0, 18, 46, 0.44)',
    '0px 84px 168px rgba(0, 18, 46, 0.46)',
    '0px 88px 176px rgba(0, 18, 46, 0.48)',
    '0px 92px 184px rgba(0, 18, 46, 0.5)',
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: designTokens.shape.borderRadius,
          padding: '12px 24px',
          fontSize: '1rem',
          fontWeight: 600,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: `0px 4px 12px ${designTokens.borders.veryStrong.replace('1px solid ', '')}`,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backdropFilter: designTokens.effects.backdropBlur,
          backgroundColor: designTokens.colors.background.paper,
          border: designTokens.borders.light,
          borderRadius: designTokens.shape.borderRadius,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: designTokens.shape.borderRadius,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: designTokens.colors.background.paperDark,
          backdropFilter: designTokens.effects.backdropBlur,
          border: designTokens.borders.medium,
          borderRadius: designTokens.shape.borderRadius,
          color: designTokens.colors.text.primary,
          overflowX: 'hidden',
          margin: '16px',
          maxHeight: 'calc(100% - 32px)',
          maxWidth: 'calc(100% - 32px)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: designTokens.colors.background.paperDark,
          backdropFilter: designTokens.effects.backdropBlur,
          border: designTokens.borders.medium,
          borderRadius: designTokens.shape.borderRadius,
          color: designTokens.colors.text.primary,
          fontSize: '0.875rem',
          padding: '8px 12px',
        },
        arrow: {
          color: designTokens.colors.background.paperDark,
          '&::before': {
            border: designTokens.borders.medium,
          },
        },
      },
    },

    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: designTokens.colors.background.default,
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
    backgroundColor: designTokens.colors.background.default,
    overflowX: 'hidden',
    overflowY: 'hidden',
    '@media (max-width: 900px)': {
      overflowY: 'auto',
    },
    position: 'relative',
    fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica", "Arial", sans-serif',
    '&::before': {
      content: '""',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: `url(${backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      filter: 'grayscale(45%) brightness(0.7) contrast(0.9) saturate(0.8)',
      opacity: 0.5,
      zIndex: 0,
    },
  },

  '#root': {
    width: '100%',
    minHeight: '100vh',
    position: 'relative',
    zIndex: 1,
  },
});
