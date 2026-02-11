import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/indexeddb';
import { createPXE } from '@aztec/pxe/client/lazy';
import { getPXEConfig } from '@aztec/pxe/config';

import { LazyAccountContractsProvider } from './account-contract-providers/lazy.js';
import { EmbeddedWallet } from './embedded_wallet.js';
import { WalletDB } from './wallet_db.js';

export class BrowserEmbeddedWallet extends EmbeddedWallet {
  static async create(nodeUrl: string): Promise<BrowserEmbeddedWallet> {
    const aztecNode = createAztecNodeClient(nodeUrl);

    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const rollupAddress = l1Contracts.rollupAddress;

    const config = getPXEConfig();
    config.dataDirectory = `pxe-${rollupAddress}`;

    const pxe = await createPXE(aztecNode, config, {
      loggers: {
        store: createLogger('pxe:data:idb'),
        pxe: createLogger('pxe:service'),
        prover: createLogger('bb:wasm:lazy'),
      },
    });

    const logger = createLogger('embedded-wallet:browser');
    const walletDBStore = await createStore(
      `wallet-${rollupAddress}`,
      { dataDirectory: 'wallet', dataStoreMapSizeKb: 2e10 },
      undefined,
      createLogger('wallet:data:idb'),
    );
    const walletDB = WalletDB.init(walletDBStore, logger.info);

    return new BrowserEmbeddedWallet(pxe, aztecNode, walletDB, new LazyAccountContractsProvider());
  }
}
