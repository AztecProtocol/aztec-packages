import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { createStore, openTmpStore } from '@aztec/kv-store/indexeddb';
import { type PXE, type PXECreationOptions, createPXE } from '@aztec/pxe/client/lazy';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/config';

import { LazyAccountContractsProvider } from '../account-contract-providers/lazy.js';
import type { AccountContractsProvider } from '../account-contract-providers/types.js';
import { EmbeddedWallet, type EmbeddedWalletOptions } from '../embedded_wallet.js';
import { WalletDB } from '../wallet_db.js';

export class BrowserEmbeddedWallet extends EmbeddedWallet {
  static async create<T extends BrowserEmbeddedWallet = BrowserEmbeddedWallet>(
    this: new (
      pxe: PXE,
      aztecNode: AztecNode,
      walletDB: WalletDB,
      accountContracts: AccountContractsProvider,
      log?: Logger,
    ) => T,
    nodeOrUrl: string | AztecNode,
    options: EmbeddedWalletOptions = {},
  ): Promise<T> {
    const rootLogger = options.logger ?? createLogger('embedded-wallet');

    const aztecNode = typeof nodeOrUrl === 'string' ? createAztecNodeClient(nodeOrUrl) : nodeOrUrl;
    const l1Contracts = await aztecNode.getL1ContractAddresses();

    const pxeConfig: PXEConfig = Object.assign(getPXEConfig(), {
      proverEnabled: options.pxeConfig?.proverEnabled ?? false,
      dataDirectory: `pxe_data_${l1Contracts.rollupAddress}`,
      ...options.pxeConfig,
    });

    if (options.ephemeral) {
      delete pxeConfig.dataDirectory;
    }

    const pxeOptions: PXECreationOptions = {
      ...options.pxeOptions,
      loggers: {
        store: rootLogger.createChild('pxe:data'),
        pxe: rootLogger.createChild('pxe:service'),
        prover: rootLogger.createChild('pxe:prover'),
        ...options.pxeOptions?.loggers,
      },
    };

    const pxe = await createPXE(aztecNode, pxeConfig, pxeOptions);

    const walletDBStore = options.ephemeral
      ? await openTmpStore(true)
      : await createStore(
          'wallet_data',
          {
            dataDirectory: `wallet_data_${l1Contracts.rollupAddress}`,
            dataStoreMapSizeKb: pxeConfig.dataStoreMapSizeKb,
            l1Contracts,
          },
          1,
          rootLogger.createChild('wallet:data'),
        );
    const walletDB = WalletDB.init(walletDBStore, rootLogger.createChild('wallet:db').info);

    return new this(pxe, aztecNode, walletDB, new LazyAccountContractsProvider(), rootLogger) as T;
  }
}

export { BrowserEmbeddedWallet as EmbeddedWallet };
export type { EmbeddedWalletOptions } from '../embedded_wallet.js';
export { WalletDB } from '../wallet_db.js';
export type { AccountType } from '../wallet_db.js';
