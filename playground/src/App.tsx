import { Global } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import { NotificationsProvider } from '@toolpad/core/useNotifications';
import { globalStyle, theme } from './global.styles';
import Home from './components/home/Home';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Global styles={globalStyle}></Global>
      <NotificationsProvider>
        <Home />
      </NotificationsProvider>
    </ThemeProvider>
  );
}

export default App;
