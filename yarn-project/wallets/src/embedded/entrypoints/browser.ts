import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { createStore, openTmpStore } from '@aztec/kv-store/indexeddb';
import { type PXE, type PXECreationOptions, createPXE } from '@aztec/pxe/client/lazy';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/config';
import { getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry/lazy';
import { getStandardMultiCallEntrypoint } from '@aztec/standard-contracts/multi-call-entrypoint/lazy';

import { LazyAccountContractsProvider } from '../account-contract-providers/lazy.js';
import type { AccountContractsProvider } from '../account-contract-providers/types.js';
import { EmbeddedWallet, type EmbeddedWalletOptions, splitPxeOptions } from '../embedded_wallet.js';
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

    // Support both the new unified `pxe` option and the deprecated `pxeConfig`/`pxeOptions`.
    const { config: pxeConfigFromPxe, creation: pxeCreationFromPxe } = splitPxeOptions(options.pxe);
    const mergedConfigOverrides = { ...options.pxeConfig, ...pxeConfigFromPxe };
    const mergedCreationOverrides: PXECreationOptions = { ...options.pxeOptions, ...pxeCreationFromPxe };

    const pxeConfig: PXEConfig = Object.assign(getPXEConfig(), {
      proverEnabled: mergedConfigOverrides.proverEnabled ?? false,
      dataDirectory: `pxe_data_${l1Contracts.rollupAddress}`,
      autoSync: false,
      ...mergedConfigOverrides,
    });

    if (options.ephemeral) {
      delete pxeConfig.dataDirectory;
    }

    const pxeOptions: PXECreationOptions = {
      ...mergedCreationOverrides,
      preloadedContractsProvider: mergedCreationOverrides.preloadedContractsProvider ?? {
        getPreloadedContracts: async () => [await getStandardMultiCallEntrypoint(), await getStandardAuthRegistry()],
      },
      loggers: {
        store: rootLogger.createChild('pxe:data'),
        pxe: rootLogger.createChild('pxe:service'),
        prover: rootLogger.createChild('pxe:prover'),
        ...mergedCreationOverrides.loggers,
      },
    };

    const pxe = await createPXE(aztecNode, pxeConfig, pxeOptions);

    const walletDBStore =
      options.walletDb?.store ??
      (options.ephemeral
        ? await openTmpStore(true)
        : await createStore(
            'wallet_data',
            {
              dataDirectory: `wallet_data_${l1Contracts.rollupAddress}`,
              dataStoreMapSizeKb: pxeConfig.dataStoreMapSizeKb,
              rollupAddress: l1Contracts.rollupAddress,
            },
            1,
            rootLogger.createChild('wallet:data'),
          ));
    const walletDB = new WalletDB(walletDBStore, rootLogger.createChild('wallet:db').info);

    const wallet = new this(pxe, aztecNode, walletDB, new LazyAccountContractsProvider(), rootLogger) as T;
    await wallet.initStubClasses();
    return wallet;
  }
}

export { BrowserEmbeddedWallet as EmbeddedWallet };
export type { EmbeddedWalletOptions, EmbeddedWalletPXEOptions } from '../embedded_wallet.js';
export { WalletDB } from '../wallet_db.js';
export type { AccountType } from '../wallet_db.js';

// At-rest encryption helpers are intentionally NOT re-exported here. They live
// on the `@aztec/wallets/embedded/store-encryption` sub-path so consumers
// (and bundlers) of this entrypoint don't transitively pull in
// `@aztec/kv-store/sqlite-opfs` and its `new Worker(new URL('./worker.js'))`
// chain into `@aztec/sqlite3mc-wasm`. Apps that don't use encryption-at-rest
// (e.g. the playground) should never see sqlite-opfs in their bundle.
