import { Blob } from '@aztec/blob-lib';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import { type Hex, type TransactionSerializable, formatGwei } from 'viem';

import type { EthSigner } from './eth-signer/eth-signer.js';
import {
  type GasPrice,
  L1TxUtils,
  type L1TxUtilsConfig,
  type SigningCallback,
  createViemSigner,
} from './l1_tx_utils.js';
import type { ExtendedViemWalletClient, ViemClient } from './types.js';

export class L1TxUtilsWithBlobs extends L1TxUtils {
  /**
   * Attempts to cancel a transaction by sending a 0-value tx to self with same nonce but higher gas prices
   * @param nonce - The nonce of the transaction to cancel
   * @param allVersions - Hashes of all transactions submitted under the same nonce (any of them could mine)
   * @param previousGasPrice - The gas price of the previous transaction
   * @param attempts - The number of attempts to cancel the transaction
   * @returns The hash of the cancellation transaction
   */
  override async attemptTxCancellation(
    currentTxHash: Hex,
    nonce: number,
    allVersions: Set<Hex>,
    isBlobTx = false,
    previousGasPrice?: GasPrice,
    attempts = 0,
  ) {
    // Get gas price with higher priority fee for cancellation
    const cancelGasPrice = await this.getGasPrice(
      {
        ...this.config,
        // Use high bump for cancellation to ensure it replaces the original tx
        priorityFeeRetryBumpPercentage: 150, // 150% bump should be enough to replace any tx
      },
      isBlobTx,
      attempts + 1,
      previousGasPrice,
    );

    this.logger?.info(`Attempting to cancel blob L1 transaction ${currentTxHash} with nonce ${nonce}`, {
      maxFeePerGas: formatGwei(cancelGasPrice.maxFeePerGas),
      maxPriorityFeePerGas: formatGwei(cancelGasPrice.maxPriorityFeePerGas),
      maxFeePerBlobGas:
        cancelGasPrice.maxFeePerBlobGas === undefined ? undefined : formatGwei(cancelGasPrice.maxFeePerBlobGas),
    });
    const request = {
      to: this.getSenderAddress().toString(),
      value: 0n,
    };

    // Send 0-value tx to self with higher gas price
    if (!isBlobTx) {
      const txData = {
        ...request,
        nonce,
        gas: 21_000n, // Standard ETH transfer gas
        maxFeePerGas: cancelGasPrice.maxFeePerGas,
        maxPriorityFeePerGas: cancelGasPrice.maxPriorityFeePerGas,
      };
      const signedRequest = await this.prepareSignedTransaction(txData);
      const cancelTxHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

      this.logger?.info(`Sent cancellation tx ${cancelTxHash} for timed out tx ${currentTxHash}`);

      const receipt = await this.monitorTransaction(
        request,
        cancelTxHash,
        allVersions,
        { gasLimit: 21_000n },
        undefined,
        undefined,
        true,
      );

      return receipt.transactionHash;
    } else {
      const blobData = new Uint8Array(131072).fill(0);
      const kzg = Blob.getViemKzgInstance();
      const blobInputs = {
        blobs: [blobData],
        kzg,
        maxFeePerBlobGas: cancelGasPrice.maxFeePerBlobGas!,
      };
      const txData = {
        ...request,
        ...blobInputs,
        nonce,
        gas: 21_000n,
        maxFeePerGas: cancelGasPrice.maxFeePerGas,
        maxPriorityFeePerGas: cancelGasPrice.maxPriorityFeePerGas,
      };
      const signedRequest = await this.prepareSignedTransaction(txData);
      const cancelTxHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

      this.logger?.info(`Sent cancellation tx ${cancelTxHash} for timed out tx ${currentTxHash}`);

      const receipt = await this.monitorTransaction(
        request,
        cancelTxHash,
        allVersions,
        { gasLimit: 21_000n },
        undefined,
        blobInputs,
        true,
      );

      return receipt.transactionHash;
    }
  }
}

export function createL1TxUtilsWithBlobsFromViemWallet(
  client: ExtendedViemWalletClient,
  logger: Logger = createLogger('L1TxUtils'),
  dateProvider: DateProvider = new DateProvider(),
  config?: Partial<L1TxUtilsConfig>,
  debugMaxGasLimit: boolean = false,
) {
  return new L1TxUtilsWithBlobs(
    client,
    EthAddress.fromString(client.account.address),
    createViemSigner(client),
    logger,
    dateProvider,
    config,
    debugMaxGasLimit,
  );
}

export function createL1TxUtilsWithBlobsFromEthSigner(
  client: ViemClient,
  signer: EthSigner,
  logger: Logger = createLogger('L1TxUtils'),
  dateProvider: DateProvider = new DateProvider(),
  config?: Partial<L1TxUtilsConfig>,
  debugMaxGasLimit: boolean = false,
) {
  const callback: SigningCallback = async (transaction: TransactionSerializable, _signingAddress) => {
    return (await signer.signTransaction(transaction)).toViemTransactionSignature();
  };

  return new L1TxUtilsWithBlobs(client, signer.address, callback, logger, dateProvider, config, debugMaxGasLimit);
}
