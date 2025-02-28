import { Global } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import { globalStyle, theme } from './common.styles';
import Home from './components/home/home';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Global styles={globalStyle}></Global>
      <Home />
    </ThemeProvider>
  );
}

export default App;
