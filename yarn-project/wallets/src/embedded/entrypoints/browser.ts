import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { createStore, openTmpStore } from '@aztec/kv-store/sqlite-opfs';
import { type PXE, type PXECreationOptions, createPXE } from '@aztec/pxe/client/lazy';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/config';
import { getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry/lazy';
import { getStandardHandshakeRegistry } from '@aztec/standard-contracts/handshake-registry/lazy';
import { getStandardMultiCallEntrypoint } from '@aztec/standard-contracts/multi-call-entrypoint/lazy';

import { LazyAccountContractsProvider } from '../account-contract-providers/lazy.js';
import type { AccountContractsProvider } from '../account-contract-providers/types.js';
import { EmbeddedWallet, type EmbeddedWalletOptions, splitPxeOptions } from '../embedded_wallet.js';
import { resolveStartupInfo } from '../node_info_cache.js';
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
    const nodeInfoUrl = typeof nodeOrUrl === 'string' ? nodeOrUrl : undefined;
    const nodeInfoCacheStore =
      nodeInfoUrl && !options.ephemeral
        ? await createStore(
            'node_info_cache',
            { dataDirectory: 'node_info_cache', dataStoreMapSizeKb: getPXEConfig().dataStoreMapSizeKb },
            undefined,
            rootLogger.createChild('node-info-cache'),
          ).catch(err => {
            rootLogger.debug('Could not open node info cache store; will fetch node info', { err });
            return undefined;
          })
        : undefined;
    const { nodeInfo, initialBlockHash } = await resolveStartupInfo(
      aztecNode,
      nodeInfoUrl,
      nodeInfoCacheStore,
      rootLogger,
    );
    const l1Contracts = nodeInfo.l1ContractAddresses;

    // Support both the new unified `pxe` option and the deprecated `pxeConfig`/`pxeOptions`.
    const { config: pxeConfigFromPxe, creation: pxeCreationFromPxe } = splitPxeOptions(options.pxe);
    const mergedConfigOverrides = { ...options.pxeConfig, ...pxeConfigFromPxe };
    const mergedCreationOverrides: PXECreationOptions = { ...options.pxeOptions, ...pxeCreationFromPxe };

    const pxeConfig: PXEConfig = Object.assign(getPXEConfig(), {
      proverEnabled: mergedConfigOverrides.proverEnabled,
      dataDirectory: `pxe_data_${l1Contracts.rollupAddress}`,
      autoSync: false,
      ...mergedConfigOverrides,
    });

    if (options.ephemeral) {
      delete pxeConfig.dataDirectory;
    }

    const pxeOptions: PXECreationOptions = {
      ...mergedCreationOverrides,
      nodeInfo,
      initialBlockHash,
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
    wallet.seedNodeInfo(nodeInfo);
    await wallet.initStubClasses();
    return wallet;
  }
}

export { BrowserEmbeddedWallet as EmbeddedWallet };
export type { EmbeddedWalletOptions, EmbeddedWalletPXEOptions } from '../embedded_wallet.js';
export { WalletDB } from '../wallet_db.js';
export type { AccountType } from '../wallet_db.js';
