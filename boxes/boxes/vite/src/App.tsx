import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";
import { Home } from "./pages/home";
import { useEffect, useState } from "react";
import initACVM from "@noir-lang/acvm_js/web/acvm_js";
import initABI from "@noir-lang/noirc_abi/web/noirc_abi_wasm";
import acvmURL from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import abiURL from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";

const InitWasm = ({ children }: any) => {
  const [init, setInit] = useState(false);
  useEffect(() => {
    (async () => {
      await Promise.all([
        initACVM(new URL(acvmURL, import.meta.url).toString()),
        initABI(new URL(abiURL, import.meta.url).toString()),
      ]);
      setInit(true);
    })();
  }, []);

  return <div>{init && children}</div>;
};

function App() {
  return (
    <InitWasm>
      <Home />
      <ToastContainer />
    </InitWasm>
  );
}

export default App;
