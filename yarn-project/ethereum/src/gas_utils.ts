import { type DebugLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type HttpTransport,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
  formatGwei,
} from 'viem';

// 1_000_000_000 Gwei = 1 ETH
// 1_000_000_000 Wei = 1 Gwei
// 1_000_000_000_000_000_000 Wei = 1 ETH

const WEI_CONST = 1_000_000_000n;

export interface GasConfig {
  /**
   * How much to increase gas price by each attempt (percentage)
   */
  bufferPercentage?: bigint;
  /**
   * Fixed buffer to add to gas price
   */
  bufferFixed?: bigint;
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

export interface L1TxMonitorConfig {
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
}

export interface L1TxRequest {
  to: Address;
  data: Hex;
  value?: bigint;
}

const DEFAULT_GAS_CONFIG: GasConfig = {
  bufferPercentage: 20n,
  maxGwei: 500n,
  minGwei: 1n,
  priorityFeeGwei: 2n,
};

const DEFAULT_MONITOR_CONFIG: Required<L1TxMonitorConfig> = {
  maxAttempts: 3,
  checkIntervalMs: 30_000,
  stallTimeMs: 60_000,
};

export class GasUtils {
  private readonly gasConfig: GasConfig;
  private readonly monitorConfig: L1TxMonitorConfig;

  constructor(
    private readonly publicClient: PublicClient,
    private readonly walletClient: WalletClient<HttpTransport, Chain, Account>,
    private readonly logger?: DebugLogger,
    gasConfig?: GasConfig,
    monitorConfig?: L1TxMonitorConfig,
  ) {
    this.gasConfig! = {
      ...DEFAULT_GAS_CONFIG,
      ...(gasConfig || {}),
    };
    this.monitorConfig! = {
      ...DEFAULT_MONITOR_CONFIG,
      ...(monitorConfig || {}),
    };
  }

  /**
   * Sends a transaction and monitors it until completion, handling gas estimation and price bumping
   * @param walletClient - The wallet client for sending the transaction
   * @param request - The transaction request (to, data, value)
   * @param monitorConfig - Optional monitoring configuration
   * @returns The hash of the successful transaction
   */
  public async sendAndMonitorTransaction(
    request: L1TxRequest,
    _gasConfig?: Partial<GasConfig>,
    _monitorConfig?: Partial<L1TxMonitorConfig>,
  ): Promise<TransactionReceipt> {
    const monitorConfig = { ...this.monitorConfig, ..._monitorConfig };
    const gasConfig = { ...this.gasConfig, ..._gasConfig };
    const account = this.walletClient.account;
    // Estimate gas
    const gasLimit = await this.estimateGas(account, request);

    const gasPrice = await this.getGasPrice(gasConfig);
    const nonce = await this.publicClient.getTransactionCount({ address: account.address });

    // Send initial tx
    const txHash = await this.walletClient.sendTransaction({
      ...request,
      gas: gasLimit,
      maxFeePerGas: gasPrice,
      nonce,
    });

    this.logger?.verbose(
      `Sent L1 transaction ${txHash} with gas limit ${gasLimit} and price ${formatGwei(gasPrice)} gwei`,
    );

    // Track all tx hashes we send
    const txHashes = new Set<Hex>([txHash]);
    let currentTxHash = txHash;
    let attempts = 0;
    let lastSeen = Date.now();
    while (true) {
      try {
        const currentNonce = await this.publicClient.getTransactionCount({ address: account.address });
        if (currentNonce > nonce) {
          // A tx with this nonce has been mined - check all our tx hashes
          for (const hash of txHashes) {
            try {
              const receipt = await this.publicClient.getTransactionReceipt({ hash });
              if (receipt) {
                this.logger?.debug(`L1 Transaction ${hash} confirmed`);
                if (receipt.status === 'reverted') {
                  this.logger?.error(`L1 Transaction ${hash} reverted`);
                  throw new Error(`Transaction ${hash} reverted`);
                }
                return receipt;
              }
            } catch (err) {
              if (err instanceof Error && err.message.includes('reverted')) {
                throw err;
              }
              // We can ignore other errors - just try the next hash
            }
          }
        }

        // Check if current tx is pending
        const tx = await this.publicClient.getTransaction({ hash: currentTxHash });

        // Get time passed
        const timePassed = Date.now() - lastSeen;

        if (tx && timePassed < monitorConfig.stallTimeMs) {
          this.logger?.debug(`L1 Transaction ${currentTxHash} pending. Time passed: ${timePassed}ms`);
          lastSeen = Date.now();
          await sleep(monitorConfig.checkIntervalMs);
          continue;
        }

        // Enough time has passed - might be stuck
        if (timePassed > monitorConfig.stallTimeMs && attempts < monitorConfig.maxAttempts) {
          attempts++;
          const newGasPrice = await this.getGasPrice();

          this.logger?.debug(
            `L1 Transaction ${currentTxHash} appears stuck. Attempting speed-up ${attempts}/${monitorConfig.maxAttempts} ` +
              `with new gas price ${formatGwei(newGasPrice)} gwei`,
          );

          // Send replacement tx with higher gas price
          currentTxHash = await this.walletClient.sendTransaction({
            ...request,
            nonce,
            gas: gasLimit,
            maxFeePerGas: newGasPrice,
          });

          // Record new tx hash
          txHashes.add(currentTxHash);
          lastSeen = Date.now();
        }
        await sleep(monitorConfig.checkIntervalMs);
      } catch (err: any) {
        this.logger?.warn(`Error monitoring tx ${currentTxHash}:`, err);
        if (err.message?.includes('reverted')) {
          throw err;
        }
        await sleep(monitorConfig.checkIntervalMs);
      }
    }
  }

  /**
   * Gets the current gas price with bounds checking
   */
  private async getGasPrice(_gasConfig?: GasConfig): Promise<bigint> {
    const gasConfig = { ...this.gasConfig, ..._gasConfig };
    const block = await this.publicClient.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas ?? 0n;
    const priorityFee = gasConfig.priorityFeeGwei * WEI_CONST;

    // First ensure we're at least meeting the base fee
    const minRequired = baseFee;
    const maxAllowed = gasConfig.maxGwei * WEI_CONST;

    // Our gas price must be at least the base fee
    let finalGasPrice = minRequired;

    // Add priority fee if we have room under the max
    if (finalGasPrice + priorityFee <= maxAllowed) {
      finalGasPrice += priorityFee;
    }

    this.logger?.debug(
      `Gas price calculation: baseFee=${formatGwei(baseFee)}, priority=${gasConfig.priorityFeeGwei}, final=${formatGwei(
        finalGasPrice,
      )}`,
    );

    return finalGasPrice;
  }

  /**
   * Estimates gas and adds buffer
   */
  private async estimateGas(account: Account, request: L1TxRequest, _gasConfig?: GasConfig): Promise<bigint> {
    const gasConfig = { ...this.gasConfig, ..._gasConfig };
    const initialEstimate = await this.publicClient.estimateGas({ account, ...request });

    // Add buffer based on either fixed amount or percentage
    const withBuffer = gasConfig.bufferFixed
      ? initialEstimate + gasConfig.bufferFixed
      : initialEstimate + (initialEstimate * (gasConfig.bufferPercentage ?? 0n)) / 100n;

    return withBuffer;
  }
}
