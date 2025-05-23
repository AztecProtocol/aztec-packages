import { Blob } from '@aztec/blob-lib';

import { formatGwei } from 'viem';

import { type GasPrice, L1TxUtils } from './l1_tx_utils.js';

export class L1TxUtilsWithBlobs extends L1TxUtils {
  /**
   * Attempts to cancel a transaction by sending a 0-value tx to self with same nonce but higher gas prices
   * @param nonce - The nonce of the transaction to cancel
   * @param previousGasPrice - The gas price of the previous transaction
   * @param attempts - The number of attempts to cancel the transaction
   * @returns The hash of the cancellation transaction
   */
  override async attemptTxCancellation(nonce: number, isBlobTx = false, previousGasPrice?: GasPrice, attempts = 0) {
    const account = this.client.account;

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

    this.logger?.debug(`Attempting to cancel transaction with nonce ${nonce}`, {
      maxFeePerGas: formatGwei(cancelGasPrice.maxFeePerGas),
      maxPriorityFeePerGas: formatGwei(cancelGasPrice.maxPriorityFeePerGas),
    });
    const request = {
      to: account.address,
      value: 0n,
    };

    // Send 0-value tx to self with higher gas price
    if (!isBlobTx) {
      const cancelTxHash = await this.client.sendTransaction({
        ...request,
        nonce,
        gas: 21_000n, // Standard ETH transfer gas
        maxFeePerGas: cancelGasPrice.maxFeePerGas,
        maxPriorityFeePerGas: cancelGasPrice.maxPriorityFeePerGas,
      });
      const receipt = await this.monitorTransaction(
        request,
        cancelTxHash,
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
      const cancelTxHash = await this.client.sendTransaction({
        ...request,
        ...blobInputs,
        nonce,
        gas: 21_000n,
        maxFeePerGas: cancelGasPrice.maxFeePerGas,
        maxPriorityFeePerGas: cancelGasPrice.maxPriorityFeePerGas,
      });
      const receipt = await this.monitorTransaction(
        request,
        cancelTxHash,
        { gasLimit: 21_000n },
        undefined,
        blobInputs,
        true,
      );

      return receipt.transactionHash;
    }
  }
}
