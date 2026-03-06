import type { BlobKzgInstance } from '@aztec/blob-lib/types';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import type { EthSigner } from '../eth-signer/eth-signer.js';
import type { ExtendedViemWalletClient, ViemClient } from '../types.js';
import type { L1TxUtilsConfig } from './config.js';
import type { IL1TxMetrics, IL1TxStore } from './interfaces.js';
import { L1TxUtils } from './l1_tx_utils.js';
import { createViemSigner } from './signer.js';
import { Delayer } from './tx_delayer.js';
import type { SigningCallback } from './types.js';

/** Source of signing capability: either a wallet client or a separate client + signer. */
export type L1SignerSource = ExtendedViemWalletClient | { client: ViemClient; signer: EthSigner };

export function resolveSignerSource(source: L1SignerSource): {
  client: ViemClient;
  address: EthAddress;
  signingCallback: SigningCallback;
} {
  if ('account' in source && source.account) {
    return {
      client: source as ExtendedViemWalletClient,
      address: EthAddress.fromString((source as ExtendedViemWalletClient).account.address),
      signingCallback: createViemSigner(source as ExtendedViemWalletClient),
    };
  }
  const { client, signer } = source as { client: ViemClient; signer: EthSigner };
  return {
    client,
    address: signer.address,
    signingCallback: async (tx, _addr) => (await signer.signTransaction(tx)).toViemTransactionSignature(),
  };
}

export function createL1TxUtils(
  source: L1SignerSource,
  deps?: {
    logger?: Logger;
    dateProvider?: DateProvider;
    store?: IL1TxStore;
    metrics?: IL1TxMetrics;
    kzg?: BlobKzgInstance;
    delayer?: Delayer;
  },
  config?: Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean },
): L1TxUtils {
  const { client, address, signingCallback } = resolveSignerSource(source);
  return new L1TxUtils(
    client,
    address,
    signingCallback,
    deps?.logger,
    deps?.dateProvider,
    config,
    config?.debugMaxGasLimit ?? false,
    deps?.store,
    deps?.metrics,
    deps?.kzg,
    deps?.delayer,
  );
}
