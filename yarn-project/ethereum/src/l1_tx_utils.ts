import {
  type ConfigMappingsType,
  bigintConfigHelper,
  getDefaultConfig,
  numberConfigHelper,
} from '@aztec/foundation/config';
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

export interface L1TxUtilsConfig {
  /**
   * How much to increase calculated gas limit.
   */
  bufferPercentage?: bigint;
  /**
   * Fixed buffer to add to gas price
   */
  bufferFixed?: bigint;
  /**
   * Maximum gas price in gwei
   */
  maxGwei?: bigint;
  /**
   * Minimum gas price in gwei
   */
  minGwei?: bigint;
  /**
   * How much to increase priority fee by each attempt (percentage)
   */
  priorityFeeBumpPercentage?: bigint;
  /**
   * Maximum number of speed-up attempts
   */
  maxAttempts?: number;
  /**
   * How often to check tx status
   */
  checkIntervalMs?: number;
  /**
   * How long before considering tx stalled
   */
  stallTimeMs?: number;
}

export const l1TxUtilsConfigMappings: ConfigMappingsType<L1TxUtilsConfig> = {
  bufferPercentage: {
    description: 'How much to increase gas price by each attempt (percentage)',
    env: 'L1_GAS_LIMIT_BUFFER_PERCENTAGE',
    ...bigintConfigHelper(20n),
  },
  bufferFixed: {
    description: 'Fixed buffer to add to gas price',
    env: 'L1_GAS_LIMIT_BUFFER_FIXED',
    ...bigintConfigHelper(),
  },
  minGwei: {
    description: 'Minimum gas price in gwei',
    env: 'L1_GAS_PRICE_MIN',
    ...bigintConfigHelper(1n),
  },
  maxGwei: {
    description: 'Maximum gas price in gwei',
    env: 'L1_GAS_PRICE_MAX',
    ...bigintConfigHelper(100n),
  },
  priorityFeeBumpPercentage: {
    description: 'How much to increase priority fee by each attempt (percentage)',
    env: 'L1_PRIORITY_FEE_BUMP_PERCENTAGE',
    ...bigintConfigHelper(20n),
  },
  maxAttempts: {
    description: 'Maximum number of speed-up attempts',
    env: 'L1_TX_MONITOR_MAX_ATTEMPTS',
    ...numberConfigHelper(3),
  },
  checkIntervalMs: {
    description: 'How often to check tx status',
    env: 'L1_TX_MONITOR_CHECK_INTERVAL_MS',
    ...numberConfigHelper(30_000),
  },
  stallTimeMs: {
    description: 'How long before considering tx stalled',
    env: 'L1_TX_MONITOR_STALL_TIME_MS',
    ...numberConfigHelper(60_000),
  },
};

export const defaultL1TxUtilsConfig = getDefaultConfig<L1TxUtilsConfig>(l1TxUtilsConfigMappings);

export interface L1TxRequest {
  to: Address | null;
  data: Hex;
  value?: bigint;
}

interface GasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export class L1TxUtils {
  private readonly config: L1TxUtilsConfig;

  constructor(
    private readonly publicClient: PublicClient,
    private readonly walletClient: WalletClient<HttpTransport, Chain, Account>,
    private readonly logger?: DebugLogger,
    config?: Partial<L1TxUtilsConfig>,
  ) {
    this.config = {
      ...defaultL1TxUtilsConfig,
      ...(config || {}),
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
    _gasConfig?: Partial<L1TxUtilsConfig>,
  ): Promise<TransactionReceipt> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const account = this.walletClient.account;
    // Estimate gas
    const gasLimit = await this.estimateGas(account, request);

    const gasPrice = await this.getGasPrice(gasConfig);
    const nonce = await this.publicClient.getTransactionCount({ address: account.address });
    // Send initial tx
    const txHash = await this.walletClient.sendTransaction({
      ...request,
      gas: gasLimit,
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      nonce,
    });

    this.logger?.verbose(
      `Sent L1 transaction ${txHash} with gas limit ${gasLimit} and price ${formatGwei(gasPrice.maxFeePerGas)} gwei`,
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

        if (tx && timePassed < gasConfig.stallTimeMs!) {
          this.logger?.debug(`L1 Transaction ${currentTxHash} pending. Time passed: ${timePassed}ms`);
          lastSeen = Date.now();
          await sleep(gasConfig.checkIntervalMs!);
          continue;
        }

        // Enough time has passed - might be stuck
        if (timePassed > gasConfig.stallTimeMs! && attempts < gasConfig.maxAttempts!) {
          attempts++;
          const newGasPrice = await this.getGasPrice(gasConfig, attempts);

          this.logger?.debug(
            `L1 Transaction ${currentTxHash} appears stuck. Attempting speed-up ${attempts}/${gasConfig.maxAttempts} ` +
              `with new priority fee ${formatGwei(newGasPrice.maxPriorityFeePerGas)} gwei`,
          );

          currentTxHash = await this.walletClient.sendTransaction({
            ...request,
            nonce,
            gas: gasLimit,
            maxFeePerGas: newGasPrice.maxFeePerGas,
            maxPriorityFeePerGas: newGasPrice.maxPriorityFeePerGas,
          });

          // Record new tx hash
          txHashes.add(currentTxHash);
          lastSeen = Date.now();
        }
        await sleep(gasConfig.checkIntervalMs!);
      } catch (err: any) {
        this.logger?.warn(`Error monitoring tx ${currentTxHash}:`, err);
        if (err.message?.includes('reverted')) {
          throw err;
        }
        await sleep(gasConfig.checkIntervalMs!);
      }
    }
  }

  /**
   * Gets the current gas price with bounds checking
   */
  private async getGasPrice(_gasConfig?: L1TxUtilsConfig, attempt: number = 0): Promise<GasPrice> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const block = await this.publicClient.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas ?? 0n;

    // Get initial priority fee from the network
    let priorityFee = await this.publicClient.estimateMaxPriorityFeePerGas();
    if (attempt > 0) {
      // Bump priority fee by configured percentage for each attempt
      priorityFee = (priorityFee * (100n + (gasConfig.priorityFeeBumpPercentage ?? 20n) * BigInt(attempt))) / 100n;
    }

    const maxFeePerGas = gasConfig.maxGwei! * WEI_CONST;
    const maxPriorityFeePerGas = priorityFee;

    this.logger?.debug(
      `Gas price calculation (attempt ${attempt}): baseFee=${formatGwei(baseFee)}, ` +
        `maxPriorityFee=${formatGwei(maxPriorityFeePerGas)}, maxFee=${formatGwei(maxFeePerGas)}`,
    );

    return { maxFeePerGas, maxPriorityFeePerGas };
  }

  /**
   * Estimates gas and adds buffer
   */
  private async estimateGas(account: Account, request: L1TxRequest, _gasConfig?: L1TxUtilsConfig): Promise<bigint> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const initialEstimate = await this.publicClient.estimateGas({ account, ...request });

    // Add buffer based on either fixed amount or percentage
    const withBuffer = gasConfig.bufferFixed
      ? initialEstimate + gasConfig.bufferFixed
      : initialEstimate + (initialEstimate * (gasConfig.bufferPercentage ?? 0n)) / 100n;

    return withBuffer;
  }
}
