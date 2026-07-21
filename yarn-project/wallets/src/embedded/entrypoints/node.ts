import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/config';
import { type PXE, type PXECreationOptions, createPXE, openStore } from '@aztec/pxe/server';
import { getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry';
import { getStandardHandshakeRegistry } from '@aztec/standard-contracts/handshake-registry';
import { getStandardMultiCallEntrypoint } from '@aztec/standard-contracts/multi-call-entrypoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { BundleAccountContractsProvider } from '../account-contract-providers/bundle.js';
import type { AccountContractsProvider } from '../account-contract-providers/types.js';
import { EmbeddedWallet, type EmbeddedWalletOptions, splitPxeOptions } from '../embedded_wallet.js';
import { WALLET_DATA_SCHEMA_VERSION, WalletDB } from '../wallet_db.js';

const DEFAULT_WALLET_DATA_DIRECTORY = 'aztec-wallet-data';

export class NodeEmbeddedWallet extends EmbeddedWallet {
  static async create<T extends NodeEmbeddedWallet = NodeEmbeddedWallet>(
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

    // Support both the new unified `pxe` option and the deprecated `pxeConfig`/`pxeOptions`.
    const { config: pxeConfigFromPxe, creation: pxeCreationFromPxe } = splitPxeOptions(options.pxe);
    const mergedConfigOverrides = { ...options.pxeConfig, ...pxeConfigFromPxe };
    const mergedCreationOverrides: PXECreationOptions = { ...options.pxeOptions, ...pxeCreationFromPxe };

    const pxeConfig: PXEConfig = Object.assign(getPXEConfig(), {
      proverEnabled: mergedConfigOverrides.proverEnabled,
<<<<<<< HEAD
      dataDirectory: `pxe_data_${l1Contracts.rollupAddress}`,
=======
      dataDirectory: DEFAULT_WALLET_DATA_DIRECTORY,
>>>>>>> origin/v5-next
      autoSync: false,
      ...mergedConfigOverrides,
    });

    if (options.ephemeral) {
      delete pxeConfig.dataDirectory;
    }

    const pxeOptions: PXECreationOptions = {
      ...mergedCreationOverrides,
      preloadedContractsProvider: mergedCreationOverrides.preloadedContractsProvider ?? {
        getPreloadedContracts: async () => [
          await getStandardMultiCallEntrypoint(),
          await getStandardAuthRegistry(),
          await getStandardHandshakeRegistry(),
        ],
      },
      loggers: {
        store: rootLogger.createChild('pxe:data'),
        pxe: rootLogger.createChild('pxe:service'),
        prover: rootLogger.createChild('pxe:prover'),
        ...mergedCreationOverrides.loggers,
      },
    };

    const pxe = await createPXE(aztecNode, pxeConfig, pxeOptions);

    let walletDBStore = options.walletDb?.store;
    if (!walletDBStore) {
      const bindings = rootLogger.createChild('wallet:data').getBindings();
      if (options.ephemeral) {
        walletDBStore = await openTmpStore('wallet_data', true, undefined, undefined, bindings);
      } else {
        const { l1ChainId, l1ContractAddresses } = await aztecNode.getNodeInfo();
        walletDBStore = await openStore(
          'wallet_data',
          WALLET_DATA_SCHEMA_VERSION,
          {
            dataDirectory: pxeConfig.dataDirectory ?? DEFAULT_WALLET_DATA_DIRECTORY,
            dataStoreMapSizeKb: pxeConfig.dataStoreMapSizeKb,
            l1ChainId,
            rollupAddress: l1ContractAddresses.rollupAddress,
          },
          bindings,
        );
      }
    }
    const walletDB = new WalletDB(walletDBStore, rootLogger.createChild('wallet:db').info);

    const wallet = new this(pxe, aztecNode, walletDB, new BundleAccountContractsProvider(), rootLogger) as T;
    await wallet.initStubClasses();
    return wallet;
  }
}

export { NodeEmbeddedWallet as EmbeddedWallet };
export type { EmbeddedWalletOptions, EmbeddedWalletPXEOptions } from '../embedded_wallet.js';
export { WalletDB } from '../wallet_db.js';
export type { AccountType } from '../wallet_db.js';
