import { Global } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import { NotificationsProvider } from '@toolpad/core/useNotifications';
import { globalStyle, theme } from './global.styles';
import Home from './components/home/Home';

function App() {
  return (
    <NotificationsProvider slotProps={{
      snackbar: {
        anchorOrigin: { vertical: 'top', horizontal: 'right' },
        autoHideDuration: 5000,
      }
    }}>
      <ThemeProvider theme={theme}>
        <Global styles={globalStyle}></Global>
        <Home />
      </ThemeProvider>
    </NotificationsProvider>
  );
}

export default App;
