import { type DebugLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';

import {
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
  formatGwei,
} from 'viem';

// 1_000_000_000 Gwei = 1 ETH
// 1_000_000_000 Wei = 1 Gwei
// 1_000_000_000_000_000_000 Wei = 1 ETH

export interface GasConfig {
  /**
   * How much to increase gas price by each attempt (percentage)
   */
  bufferPercentage: bigint;
  /**
   * Maximum gas price in gwei
   */
  maxGwei: bigint;
  /**
   * Minimum gas price in gwei
   */
  minGwei: bigint;
  /**
   * Priority fee in gwei
   */
  priorityFeeGwei: bigint;
}

export interface TransactionMonitorConfig {
  /**
   * Maximum number of speed-up attempts
   */
  maxAttempts: number;
  /**
   * How often to check tx status
   */
  checkIntervalMs: number;
  /**
   * How long before considering tx stalled
   */
  stallTimeMs: number;
  /**
   * How much to increase gas price by each attempt (percentage)
   */
  gasPriceIncrease: bigint;
}

const DEFAULT_GAS_CONFIG: GasConfig = {
  bufferPercentage: 20n,
  maxGwei: 500n,
  minGwei: 1n,
  priorityFeeGwei: 2n,
};

const DEFAULT_MONITOR_CONFIG: Required<TransactionMonitorConfig> = {
  maxAttempts: 3,
  checkIntervalMs: 30_000,
  stallTimeMs: 180_000,
  gasPriceIncrease: 50n,
};

export class GasUtils {
  private readonly gasConfig: GasConfig;
  private readonly monitorConfig: TransactionMonitorConfig;

  constructor(
    private readonly publicClient: PublicClient,
    private readonly logger?: DebugLogger,
    gasConfig?: GasConfig,
    monitorConfig?: TransactionMonitorConfig,
  ) {
    this.gasConfig! = gasConfig ?? DEFAULT_GAS_CONFIG;
    this.monitorConfig! = monitorConfig ?? DEFAULT_MONITOR_CONFIG;
  }

  /**
   * Gets the current gas price with safety buffer and bounds checking
   */
  public async getGasPrice(): Promise<bigint> {
    const block = await this.publicClient.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas ?? 0n;
    const priorityFee = this.gasConfig.priorityFeeGwei * 1_000_000_000n;

    const baseWithBuffer = baseFee + (baseFee * this.gasConfig.bufferPercentage) / 100n;
    const totalGasPrice = baseWithBuffer + priorityFee;

    const maxGasPrice = this.gasConfig.maxGwei * 1_000_000_000n;
    const minGasPrice = this.gasConfig.minGwei * 1_000_000_000n;

    let finalGasPrice: bigint;
    if (totalGasPrice < minGasPrice) {
      finalGasPrice = minGasPrice;
    } else if (totalGasPrice > maxGasPrice) {
      finalGasPrice = maxGasPrice;
    } else {
      finalGasPrice = totalGasPrice;
    }

    this.logger?.debug(
      `Gas price calculation: baseFee=${baseFee}, withBuffer=${baseWithBuffer}, priority=${priorityFee}, final=${finalGasPrice}`,
    );

    return finalGasPrice;
  }

  /**
   * Estimates gas with retries and adds buffer
   */
  public estimateGas<T extends (...args: any[]) => Promise<bigint>>(estimator: T): Promise<bigint> {
    return retry(
      async () => {
        const gas = await estimator();
        return gas + (gas * this.gasConfig.bufferPercentage) / 100n;
      },
      'gas estimation',
      makeBackoff([1, 2, 3]),
      this.logger,
      false,
    );
  }

  /**
   * Monitors a transaction and attempts to speed it up if it gets stuck
   * @param txHash - The hash of the transaction to monitor
   * @param walletClient - The wallet client for sending replacement tx
   * @param originalTx - The original transaction data for replacement
   * @param config - Monitor configuration
   */
  public async monitorTransaction(
    txHash: Hex,
    walletClient: WalletClient,
    originalTx: {
      to: Address;
      data: Hex;
      nonce: number;
      gasLimit: bigint;
      maxFeePerGas: bigint;
    },
    txMonitorConfig?: TransactionMonitorConfig,
  ): Promise<TransactionReceipt> {
    const config = { ...this.monitorConfig, ...txMonitorConfig };
    let attempts = 0;
    let lastSeen = Date.now();
    let currentTxHash = txHash;

    while (true) {
      try {
        // Check transaction status
        const receipt = await this.publicClient.getTransactionReceipt({ hash: currentTxHash });
        if (receipt) {
          this.logger?.info(`Transaction ${currentTxHash} confirmed`);
          return receipt;
        }

        // Check if transaction is pending
        const tx = await this.publicClient.getTransaction({ hash: currentTxHash });
        this.logger?.info(`Transaction ${currentTxHash} pending`);
        if (tx) {
          lastSeen = Date.now();
          await new Promise(resolve => setTimeout(resolve, config.checkIntervalMs));
          continue;
        }

        // Transaction not found and enough time has passed - might be stuck
        if (Date.now() - lastSeen > config.stallTimeMs && attempts < config.maxAttempts) {
          attempts++;
          const newGasPrice = (originalTx.maxFeePerGas * (100n + config.gasPriceIncrease)) / 100n;

          this.logger?.info(
            `Transaction ${currentTxHash} appears stuck. Attempting speed-up ${attempts}/${config.maxAttempts} ` +
              `with new gas price ${formatGwei(newGasPrice)} gwei`,
          );

          // Send replacement transaction with higher gas price
          const account = await walletClient.getAddresses().then(addresses => addresses[0]);
          currentTxHash = await walletClient.sendTransaction({
            chain: null,
            account,
            to: originalTx.to,
            data: originalTx.data,
            nonce: originalTx.nonce,
            gas: originalTx.gasLimit,
            maxFeePerGas: newGasPrice,
          });

          lastSeen = Date.now();
        }

        // await new Promise(resolve => setTimeout(resolve, cfg.checkIntervalMs));
        await sleep(config.checkIntervalMs);
      } catch (err: any) {
        this.logger?.warn(`Error monitoring transaction ${currentTxHash}:`, err);
        await new Promise(resolve => setTimeout(resolve, config.checkIntervalMs));
      }
    }
  }
}
