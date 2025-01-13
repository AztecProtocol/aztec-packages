import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";
import { Home } from "./components/home/home";
import { Global } from "@emotion/react";
import { globalStyle } from "./common.styles";

function App() {
  return (
    <>
      <Global styles={globalStyle}></Global>
      <Home />
      <ToastContainer />
    </>
  );
}

export default App;
