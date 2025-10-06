import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import type { TransactionSerializable } from 'viem';

import type { EthSigner } from '../eth-signer/eth-signer.js';
import type { ExtendedViemWalletClient, ViemClient } from '../types.js';
import type { L1TxUtilsConfig } from './config.js';
import { L1TxUtils } from './l1_tx_utils.js';
import { createViemSigner } from './signer.js';
import type { SigningCallback } from './types.js';

export function createL1TxUtilsFromViemWallet(
  client: ExtendedViemWalletClient,
  logger: Logger = createLogger('l1-tx-utils'),
  dateProvider: DateProvider = new DateProvider(),
  config?: Partial<L1TxUtilsConfig>,
  debugMaxGasLimit: boolean = false,
) {
  return new L1TxUtils(
    client,
    EthAddress.fromString(client.account.address),
    createViemSigner(client),
    logger,
    dateProvider,
    config,
    debugMaxGasLimit,
  );
}

export function createL1TxUtilsFromEthSigner(
  client: ViemClient,
  signer: EthSigner,
  logger: Logger = createLogger('l1-tx-utils'),
  dateProvider: DateProvider = new DateProvider(),
  config?: Partial<L1TxUtilsConfig>,
  debugMaxGasLimit: boolean = false,
) {
  const callback: SigningCallback = async (transaction: TransactionSerializable, _signingAddress) => {
    return (await signer.signTransaction(transaction)).toViemTransactionSignature();
  };
  return new L1TxUtils(client, signer.address, callback, logger, dateProvider, config, debugMaxGasLimit);
}
