import { Global } from "@emotion/react";
import { ThemeProvider } from "@mui/material/styles";
import { globalStyle, theme } from "./common.styles";
import { Suspense, lazy } from "react";
import { LinearProgress } from "@mui/material";

const Home = lazy(() => import("./components/home/home"));

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Global styles={globalStyle}></Global>
      <Suspense fallback={<LinearProgress />}>
        <Home />
      </Suspense>
    </ThemeProvider>
  );
}

export default App;
