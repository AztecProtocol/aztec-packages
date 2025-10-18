import { Blob } from '@aztec/blob-lib';
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
import type { L1BlobInputs, SigningCallback } from './types.js';

/** Extends L1TxUtils with the capability to cancel blobs. This needs to be a separate class so we don't require a dependency on blob-lib unnecessarily. */
export class L1TxUtilsWithBlobs extends L1TxUtils {
  /** Makes empty blob inputs for the cancellation tx. */
  protected override makeEmptyBlobInputs(maxFeePerBlobGas: bigint): Required<L1BlobInputs> {
    const blobData = new Uint8Array(131072).fill(0);
    const kzg = Blob.getViemKzgInstance();
    return { blobs: [blobData], kzg, maxFeePerBlobGas };
  }
}

export function createL1TxUtilsWithBlobsFromViemWallet(
  client: ExtendedViemWalletClient,
  deps: {
    logger?: Logger;
    dateProvider?: DateProvider;
    store?: IL1TxStore;
    metrics?: IL1TxMetrics;
  } = {},
  config: Partial<L1TxUtilsConfig> = {},
  debugMaxGasLimit: boolean = false,
) {
  return new L1TxUtilsWithBlobs(
    client,
    EthAddress.fromString(client.account.address),
    createViemSigner(client),
    deps.logger,
    deps.dateProvider,
    config,
    debugMaxGasLimit,
    deps.store,
    deps.metrics,
  );
}

export function createL1TxUtilsWithBlobsFromEthSigner(
  client: ViemClient,
  signer: EthSigner,
  deps: {
    logger?: Logger;
    dateProvider?: DateProvider;
    store?: IL1TxStore;
    metrics?: IL1TxMetrics;
  } = {},
  config: Partial<L1TxUtilsConfig> = {},
  debugMaxGasLimit: boolean = false,
) {
  const callback: SigningCallback = async (transaction: TransactionSerializable, _signingAddress) => {
    return (await signer.signTransaction(transaction)).toViemTransactionSignature();
  };

  return new L1TxUtilsWithBlobs(
    client,
    signer.address,
    callback,
    deps.logger,
    deps.dateProvider,
    config,
    debugMaxGasLimit,
    deps.store,
    deps.metrics,
  );
}
