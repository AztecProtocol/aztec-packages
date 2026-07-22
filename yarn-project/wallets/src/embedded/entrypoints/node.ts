import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { createStore, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/config';
import { type PXE, type PXECreationOptions, createPXE } from '@aztec/pxe/server';
import { getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry';
import { getStandardHandshakeRegistry } from '@aztec/standard-contracts/handshake-registry';
import { getStandardMultiCallEntrypoint } from '@aztec/standard-contracts/multi-call-entrypoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { BundleAccountContractsProvider } from '../account-contract-providers/bundle.js';
import type { AccountContractsProvider } from '../account-contract-providers/types.js';
import { EmbeddedWallet, type EmbeddedWalletOptions, splitPxeOptions } from '../embedded_wallet.js';
import { resolveNodeInfo } from '../node_info_cache.js';
import { WalletDB } from '../wallet_db.js';

// LMDB requires a schema version for its own on-disk format; the cache's logical versioning is handled by the
// compound version key inside resolveNodeInfo, so this only needs bumping if the LMDB store layout changes.
const NODE_INFO_CACHE_STORE_SCHEMA_VERSION = 1;

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
    const nodeInfoUrl = typeof nodeOrUrl === 'string' ? nodeOrUrl : undefined;
    const nodeInfoCacheStore =
      nodeInfoUrl && !options.ephemeral
        ? await createStore(
            'node_info_cache',
            NODE_INFO_CACHE_STORE_SCHEMA_VERSION,
            { dataDirectory: 'node_info_cache', dataStoreMapSizeKb: getPXEConfig().dataStoreMapSizeKb },
            rootLogger.createChild('node-info-cache').getBindings(),
          ).catch(err => {
            rootLogger.debug('Could not open node info cache store; will fetch node info', { err });
            return undefined;
          })
        : undefined;
    const nodeInfo = await resolveNodeInfo(aztecNode, nodeInfoUrl, nodeInfoCacheStore, rootLogger);
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
    wallet.seedNodeInfo(nodeInfo);
    await wallet.initStubClasses();
    return wallet;
  }
}

export { NodeEmbeddedWallet as EmbeddedWallet };
export type { EmbeddedWalletOptions, EmbeddedWalletPXEOptions } from '../embedded_wallet.js';
export { WalletDB } from '../wallet_db.js';
export type { AccountType } from '../wallet_db.js';
