import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { createLogger } from '@aztec/foundation/log';
import { createStore, openTmpStore } from '@aztec/kv-store/indexeddb';
import { createPXE } from '@aztec/pxe/client/lazy';
import { getPXEConfig } from '@aztec/pxe/config';

import { LazyAccountContractsProvider } from '../account-contract-providers/lazy.js';
import { EmbeddedWallet, type EmbeddedWalletOptions } from '../embedded_wallet.js';
import { WalletDB } from '../wallet_db.js';

export class BrowserEmbeddedWallet extends EmbeddedWallet {
  static async create(nodeUrl: string, options: EmbeddedWalletOptions = {}): Promise<BrowserEmbeddedWallet> {
    const rootLogger = options.logger ?? createLogger('embedded-wallet');

    const aztecNode = createAztecNodeClient(nodeUrl);

    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const rollupAddress = l1Contracts.rollupAddress;

    const config = getPXEConfig();
    if (!options.ephemeral) {
      config.dataDirectory = `pxe-${rollupAddress}`;
    }

    const pxe = await createPXE(aztecNode, config, {
      loggers: {
        store: rootLogger.createChild('pxe:data'),
        pxe: rootLogger.createChild('pxe:service'),
        prover: rootLogger.createChild('pxe:prover'),
      },
    });

    const walletDBStore = options.ephemeral
      ? await openTmpStore(true)
      : await createStore(
          `wallet-${rollupAddress}`,
          { dataDirectory: 'wallet', dataStoreMapSizeKb: 2e10 },
          undefined,
          rootLogger.createChild('wallet:data'),
        );
    const walletDB = WalletDB.init(walletDBStore, rootLogger.createChild('wallet:db').info);

    return new BrowserEmbeddedWallet(pxe, aztecNode, walletDB, new LazyAccountContractsProvider(), rootLogger);
  }
}

export { BrowserEmbeddedWallet as EmbeddedWallet };
export type { EmbeddedWalletOptions } from '../embedded_wallet.js';
export { WalletDB } from '../wallet_db.js';
export type { AccountType } from '../wallet_db.js';
