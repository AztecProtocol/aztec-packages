import { css } from "@emotion/react";
import { ContractComponent } from "../contract/contract";
import { SidebarComponent } from "../sidebar/sidebar";
import { useState } from "react";
import { AztecContext } from "../../aztecEnv";
import NoSleep from "nosleep.js";
import { LogPanel } from "../logPanel/logPanel";
import logoURL from "../../assets/Aztec_logo.png";
import { Box, Drawer } from "@mui/material";

const layout = css({
  display: "flex",
  flexDirection: "row",
  height: "100%",
});

const logo = css({
  width: "100%",
  padding: "0.5rem",
});

const collapsedDrawer = css({
  height: "100%",
  width: "4rem",
  backgroundColor: "var(--mui-palette-primary-light)",
  overflow: "hidden",
});

const noSleep = new NoSleep();

function enableNoSleep() {
  noSleep.enable();
  document.removeEventListener("touchstart", enableNoSleep, false);
}

// Enable wake lock.
// (must be wrapped in a user input event handler e.g. a mouse or touch handler)
document.addEventListener("touchstart", enableNoSleep, false);

export default function Home() {
  const [pxe, setPXE] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [nodeURL, setNodeURL] = useState("");
  const [node, setAztecNode] = useState(null);
  const [isPXEInitialized, setPXEInitialized] = useState(false);
  const [walletAlias, setWalletAlias] = useState("");
  const [walletDB, setWalletDB] = useState(null);
  const [currentContract, setCurrentContract] = useState(null);
  const [currentTx, setCurrentTx] = useState(null);
  const [currentContractAddress, setCurrentContractAddress] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const AztecContextInitialValue = {
    pxe,
    nodeURL,
    wallet,
    isPXEInitialized,
    walletAlias,
    walletDB,
    currentContract,
    currentTx,
    node,
    currentContractAddress,
    logs,
    logsOpen,
    drawerOpen,
    setDrawerOpen,
    setLogsOpen,
    setLogs,
    setAztecNode,
    setCurrentTx,
    setWalletDB,
    setPXEInitialized,
    setWallet,
    setPXE,
    setNodeURL,
    setWalletAlias,
    setCurrentContract,
    setCurrentContractAddress,
  };

  return (
    <div css={layout}>
      <AztecContext.Provider value={AztecContextInitialValue}>
        <div css={collapsedDrawer} onClick={() => setDrawerOpen(!drawerOpen)}>
          <img css={logo} src={logoURL} />
        </div>
        <Drawer
          sx={{
            "& .MuiDrawer-paper": {
              height: "100%",
              width: "340px",
            },
          }}
          onClose={() => setDrawerOpen(false)}
          variant="temporary"
          open={drawerOpen}
        >
          <SidebarComponent />
        </Drawer>
        <LogPanel />
        <ContractComponent />
      </AztecContext.Provider>
    </div>
  );
}
