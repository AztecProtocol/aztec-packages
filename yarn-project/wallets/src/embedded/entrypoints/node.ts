import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { createLogger } from '@aztec/foundation/log';
import { createStore as createWalletStore, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { PXEConfig } from '@aztec/pxe/config';
import { getPXEConfig } from '@aztec/pxe/config';
import { type PXECreationOptions, createPXE } from '@aztec/pxe/server';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { BundleAccountContractsProvider } from '../account-contract-providers/bundle.js';
import { EmbeddedWallet, type EmbeddedWalletOptions } from '../embedded_wallet.js';
import { WalletDB } from '../wallet_db.js';

export type NodeEmbeddedWalletOptions = EmbeddedWalletOptions & {
  /** Override PXE configuration. */
  pxeConfig?: Partial<PXEConfig>;
  /** Advanced PXE creation options (custom store, prover, simulator). */
  pxeOptions?: PXECreationOptions;
};

export class NodeEmbeddedWallet extends EmbeddedWallet {
  static async create(
    nodeOrUrl: string | AztecNode,
    options: NodeEmbeddedWalletOptions = {},
  ): Promise<NodeEmbeddedWallet> {
    const rootLogger = options.logger ?? createLogger('embedded-wallet');

    const aztecNode = typeof nodeOrUrl === 'string' ? createAztecNodeClient(nodeOrUrl) : nodeOrUrl;

    const pxeConfig = Object.assign(getPXEConfig(), {
      proverEnabled: options.pxeConfig?.proverEnabled ?? false,
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

    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const rollupAddress = l1Contracts.rollupAddress;

    const walletDBStore = options.ephemeral
      ? await openTmpStore(
          'wallet_data',
          true,
          undefined,
          undefined,
          rootLogger.createChild('wallet:data').getBindings(),
        )
      : await createWalletStore(
          'wallet_data',
          1,
          {
            dataDirectory: pxeConfig.dataDirectory,
            dataStoreMapSizeKb: pxeConfig.dataStoreMapSizeKb,
            l1Contracts: { rollupAddress },
          },
          rootLogger.createChild('wallet:data').getBindings(),
        );
    const walletDB = WalletDB.init(walletDBStore, rootLogger.createChild('wallet:db').info);

    return new NodeEmbeddedWallet(pxe, aztecNode, walletDB, new BundleAccountContractsProvider(), rootLogger);
  }
}

export { NodeEmbeddedWallet as EmbeddedWallet };
export type { EmbeddedWalletOptions } from '../embedded_wallet.js';
export { WalletDB } from '../wallet_db.js';
export type { AccountType } from '../wallet_db.js';
