import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { createStore, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/config';
import { type PXE, type PXECreationOptions, createPXE } from '@aztec/pxe/server';
import { getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry';
import { getStandardMultiCallEntrypoint } from '@aztec/standard-contracts/multi-call-entrypoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { BundleAccountContractsProvider } from '../account-contract-providers/bundle.js';
import type { AccountContractsProvider } from '../account-contract-providers/types.js';
import { EmbeddedWallet, type EmbeddedWalletOptions, splitPxeOptions } from '../embedded_wallet.js';
import { WalletDB } from '../wallet_db.js';

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
        ? await openTmpStore(
            `wallet_data_${l1Contracts.rollupAddress}`,
            true,
            undefined,
            undefined,
            rootLogger.createChild('wallet:data').getBindings(),
          )
        : await createStore(
            'wallet_data',
            1,
            {
              dataDirectory: `wallet_data_${l1Contracts.rollupAddress}`,
              dataStoreMapSizeKb: pxeConfig.dataStoreMapSizeKb,
              rollupAddress: l1Contracts.rollupAddress,
            },
            rootLogger.createChild('wallet:data').getBindings(),
          ));
    const walletDB = new WalletDB(walletDBStore, rootLogger.createChild('wallet:db').info);

    const wallet = new this(pxe, aztecNode, walletDB, new BundleAccountContractsProvider(), rootLogger) as T;
    await wallet.initStubClasses();
    await wallet.registerAuthRegistry(getStandardAuthRegistry);
    await wallet.registerMultiCallEntrypoint(getStandardMultiCallEntrypoint);
    return wallet;
  }
}

export { NodeEmbeddedWallet as EmbeddedWallet };
export type { EmbeddedWalletOptions, EmbeddedWalletPXEOptions } from '../embedded_wallet.js';
export { WalletDB } from '../wallet_db.js';
export type { AccountType } from '../wallet_db.js';
