import { Global } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import { NotificationsProvider } from '@toolpad/core/useNotifications';
import { globalStyle, theme, designTokens } from './global.styles';
import Home from './components/home/Home';

function App() {
  return (
    <NotificationsProvider
      slotProps={{
        snackbar: {
          anchorOrigin: { vertical: 'top', horizontal: 'right' },
          autoHideDuration: 5000,
          sx: {
            '& .MuiAlert-root': {
              backgroundColor: `${designTokens.colors.background.paperDark} !important`,
              backdropFilter: designTokens.effects.backdropBlur,
              color: `${designTokens.colors.text.primary} !important`,
            },
            '& .MuiAlert-standardSuccess': {
              backgroundColor: `${designTokens.colors.background.paperDark} !important`,
              border: `${designTokens.borders.veryStrong} !important`,
              color: `${designTokens.colors.primary.main} !important`,
              '& .MuiAlert-icon': {
                color: `${designTokens.colors.primary.main} !important`,
              },
            },
            '& .MuiAlert-standardError': {
              backgroundColor: `${designTokens.colors.background.paperDark} !important`,
              border: '1px solid rgba(255, 119, 100, 0.4) !important',
              color: '#FF7764 !important',
              '& .MuiAlert-icon': {
                color: '#FF7764 !important',
              },
            },
            '& .MuiAlert-standardInfo': {
              backgroundColor: `${designTokens.colors.background.paperDark} !important`,
              border: `${designTokens.borders.veryStrong} !important`,
              color: `${designTokens.colors.text.primary} !important`,
              '& .MuiAlert-icon': {
                color: `${designTokens.colors.primary.main} !important`,
              },
            },
          },
        },
      }}
    >
      <ThemeProvider theme={theme}>
        <Global styles={globalStyle}></Global>
        <Home />
      </ThemeProvider>
    </NotificationsProvider>
  );
}

export default App;
