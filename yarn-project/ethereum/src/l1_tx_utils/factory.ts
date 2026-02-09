import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import type { TransactionSerializable } from 'viem';

import type { EthSigner } from '../eth-signer/eth-signer.js';
import type { ExtendedViemWalletClient, ViemClient } from '../types.js';
import type { L1TxUtilsConfig } from './config.js';
import type { IL1TxMetrics, IL1TxStore } from './interfaces.js';
import { L1TxUtils } from './l1_tx_utils.js';
import { createViemSigner } from './signer.js';
import { type Delayer, applyDelayer } from './tx_delayer.js';
import type { SigningCallback } from './types.js';

export function createL1TxUtilsFromViemWallet(
  client: ExtendedViemWalletClient,
  deps?: {
    logger?: Logger;
    dateProvider?: DateProvider;
    store?: IL1TxStore;
    metrics?: IL1TxMetrics;
    ethereumSlotDuration?: number;
    delayer?: Delayer;
  },
  config?: Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean },
): L1TxUtils {
  const l1TxUtils = new L1TxUtils(
    client,
    EthAddress.fromString(client.account.address),
    createViemSigner(client),
    deps?.logger,
    deps?.dateProvider,
    config,
    config?.debugMaxGasLimit ?? false,
    deps?.store,
    deps?.metrics,
  );
  applyDelayer(l1TxUtils, config ?? {}, deps?.ethereumSlotDuration, deps?.delayer);
  return l1TxUtils;
}

export function createL1TxUtilsFromEthSigner(
  client: ViemClient,
  signer: EthSigner,
  deps?: {
    logger?: Logger;
    dateProvider?: DateProvider;
    store?: IL1TxStore;
    metrics?: IL1TxMetrics;
    ethereumSlotDuration?: number;
    delayer?: Delayer;
  },
  config?: Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean },
): L1TxUtils {
  const callback: SigningCallback = async (transaction: TransactionSerializable, _signingAddress) => {
    return (await signer.signTransaction(transaction)).toViemTransactionSignature();
  };

  const l1TxUtils = new L1TxUtils(
    client,
    signer.address,
    callback,
    deps?.logger,
    deps?.dateProvider,
    config,
    config?.debugMaxGasLimit ?? false,
    deps?.store,
    deps?.metrics,
  );
  applyDelayer(l1TxUtils, config ?? {}, deps?.ethereumSlotDuration, deps?.delayer);
  return l1TxUtils;
}
