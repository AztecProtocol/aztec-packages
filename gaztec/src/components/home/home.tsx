import { css } from "@emotion/react";
import { ContractComponent } from "../contract/contract";
import { SidebarComponent } from "../sidebar/sidebar";
import { useState } from "react";
import { AztecContext } from "../../aztecEnv";

const layout = css({
  display: "flex",
  flexDirection: "row",
  height: "100%",
});

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
        <SidebarComponent />
        <ContractComponent />
      </AztecContext.Provider>
    </div>
  );
}
