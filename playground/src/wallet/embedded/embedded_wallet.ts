import { WalletConnector, type AztecNode, type PXE } from "@aztec/aztec.js";
import { createPXEService, type PXEServiceConfig, getPXEServiceConfig } from '@aztec/pxe/client/lazy';
import { createContext, useContext, useEffect, useState } from "react";
import { WalletDB } from "./wallet_db";
import { WebLogger, type Log } from "../../utils/web_logger";
import { AztecContext } from "../../aztecEnv";
import { createStore } from '@aztec/kv-store/indexeddb';


export const EmbeddedWalletContext = createContext<{
    pxe: PXE,
    walletDB: WalletDB
}>({
    pxe: null,
    walletDB: null
});


export function EmbeddedWalletProvider({ children }: { children: Node}) {
  const [pxe, setPXE] = useState<PXE>(null);
  const [walletDB, setWalletDB] = useState<WalletDB>(null);

  useEffect(() => {

    const { setLogs, setTotalLogCount, node } = useContext(AztecContext);

    const init = async () =>  {
      WebLogger.create(setLogs, setTotalLogCount);
      const config = getPXEServiceConfig();
      config.dataDirectory = 'pxe';
      config.proverEnabled = true;
      const l1Contracts = await node.getL1ContractAddresses();
      const configWithContracts = {
        ...config,
        l1Contracts,
      } as PXEServiceConfig;

      const pxe = await createPXEService(node, configWithContracts, {
        loggers: {
          store: WebLogger.getInstance().createLogger('pxe:data:idb'),
          pxe: WebLogger.getInstance().createLogger('pxe:service'),
          prover: WebLogger.getInstance().createLogger('bb:wasm:lazy'),
        },
      });


      setPXE(pxe);
      const walletStore = await createStore('playground_embedded_wallet_data', {
        dataDirectory: 'wallet',
        dataStoreMapSizeKB: 1e6,
      });
      await WalletDB.getInstance().init(walletStore, WebLogger.getInstance().createLogger('wallet:idb').verbose);
      setWalletDB(WalletDB.getInstance());

      WalletConnector.getInstance(
        "embedded-wallet",
        'Playground Embedded Wallet',
        'https://aztec.network/favicon.ico',
        'network.aztec.play.wallet',

      ).announce();
    }
    init();
  }, [])

  const EmbeddedWalletContextInitialValue = {
    pxe,
    walletDB,
    setPXE,
    setWalletDB,
  };

  return (
    <EmbeddedWalletContext.Provider value={EmbeddedWalletContextInitialValue}>
    </EmbeddedWalletContext.Provider>
  )
}
