import { type AztecNode, type PXE } from "@aztec/aztec.js";
import { createPXEService, type PXEServiceConfig, getPXEServiceConfig } from '@aztec/pxe/client/lazy';
import { createContext } from "react";
import type { WalletDB } from "./wallet_db";
import { WebLogger, type Log } from "../../utils/web_logger";

export const EmbeddedWalletContext = createContext<{
    pxe: PXE,
    walletDB: WalletDB
}>({
    pxe: null,
    walletDB: null
});


  async function initPXE(
    aztecNode: AztecNode,
    setLogs: (logs: Log[]) => void,
    setTotalLogCount: (count: number) => void,
  ): Promise<PXE> {
    WebLogger.create(setLogs, setTotalLogCount);

    const config = getPXEServiceConfig();
    config.dataDirectory = 'pxe';
    config.proverEnabled = true;
    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const configWithContracts = {
      ...config,
      l1Contracts,
    } as PXEServiceConfig;

    const pxe = await createPXEService(aztecNode, configWithContracts, {
      loggers: {
        store: WebLogger.getInstance().createLogger('pxe:data:idb'),
        pxe: WebLogger.getInstance().createLogger('pxe:service'),
        prover: WebLogger.getInstance().createLogger('bb:wasm:lazy'),
      },
    });
    return pxe;
  }
