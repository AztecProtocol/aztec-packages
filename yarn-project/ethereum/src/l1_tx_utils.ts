import {
  type ConfigMappingsType,
  bigintConfigHelper,
  getDefaultConfig,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type Logger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';

import {
  type Account,
  type Address,
  type Chain,
  type GetTransactionReturnType,
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

// setting a minimum bump percentage to 10% due to geth's implementation
// https://github.com/ethereum/go-ethereum/blob/e3d61e6db028c412f74bc4d4c7e117a9e29d0de0/core/txpool/legacypool/list.go#L298
const MIN_REPLACEMENT_BUMP_PERCENTAGE = 10n;

// Avg ethereum block time is ~12s
const BLOCK_TIME_MS = 12_000;

export interface L1TxUtilsConfig {
  /**
   * How much to increase calculated gas limit.
   */
  gasLimitBufferPercentage?: bigint;
  /**
   * Maximum gas price in gwei
   */
  maxGwei?: bigint;
  /**
   * Minimum gas price in gwei
   */
  minGwei?: bigint;
  /**
   * Priority fee bump percentage
   */
  priorityFeeBumpPercentage?: bigint;
  /**
   * How much to increase priority fee by each attempt (percentage)
   */
  priorityFeeRetryBumpPercentage?: bigint;
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
  /**
   * How long to wait for a tx to be mined before giving up
   */
  txTimeoutMs?: number;
}

export const l1TxUtilsConfigMappings: ConfigMappingsType<L1TxUtilsConfig> = {
  gasLimitBufferPercentage: {
    description: 'How much to increase gas price by each attempt (percentage)',
    env: 'L1_GAS_LIMIT_BUFFER_PERCENTAGE',
    ...bigintConfigHelper(20n),
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
  priorityFeeRetryBumpPercentage: {
    description: 'How much to increase priority fee by each retry attempt (percentage)',
    env: 'L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE',
    ...bigintConfigHelper(50n),
  },
  maxAttempts: {
    description: 'Maximum number of speed-up attempts',
    env: 'L1_TX_MONITOR_MAX_ATTEMPTS',
    ...numberConfigHelper(3),
  },
  checkIntervalMs: {
    description: 'How often to check tx status',
    env: 'L1_TX_MONITOR_CHECK_INTERVAL_MS',
    ...numberConfigHelper(10_000),
  },
  stallTimeMs: {
    description: 'How long before considering tx stalled',
    env: 'L1_TX_MONITOR_STALL_TIME_MS',
    ...numberConfigHelper(30_000),
  },
  txTimeoutMs: {
    description: 'How long to wait for a tx to be mined before giving up. Set to 0 to disable.',
    env: 'L1_TX_MONITOR_TX_TIMEOUT_MS',
    ...numberConfigHelper(300_000), // 5 mins
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
    private readonly logger?: Logger,
    config?: Partial<L1TxUtilsConfig>,
  ) {
    this.config = {
      ...defaultL1TxUtilsConfig,
      ...(config || {}),
    };
  }

  /**
   * Sends a transaction with gas estimation and pricing
   * @param request - The transaction request (to, data, value)
   * @param gasConfig - Optional gas configuration
   * @returns The transaction hash and parameters used
   */
  public async sendTransaction(
    request: L1TxRequest,
    _gasConfig?: Partial<L1TxUtilsConfig> & { fixedGas?: bigint },
  ): Promise<{ txHash: Hex; gasLimit: bigint; gasPrice: GasPrice }> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const account = this.walletClient.account;
    let gasLimit: bigint;

    if (gasConfig.fixedGas) {
      gasLimit = gasConfig.fixedGas;
    } else {
      gasLimit = await this.estimateGas(account, request);
    }

    const gasPrice = await this.getGasPrice(gasConfig);

    const txHash = await this.walletClient.sendTransaction({
      ...request,
      gas: gasLimit,
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
    });

    this.logger?.verbose(
      `Sent L1 transaction ${txHash} with gas limit ${gasLimit} and price ${formatGwei(gasPrice.maxFeePerGas)} gwei`,
    );

    return { txHash, gasLimit, gasPrice };
  }

  /**
   * Monitors a transaction until completion, handling speed-ups if needed
   * @param request - Original transaction request (needed for speed-ups)
   * @param initialTxHash - Hash of the initial transaction
   * @param params - Parameters used in the initial transaction
   * @param gasConfig - Optional gas configuration
   */
  public async monitorTransaction(
    request: L1TxRequest,
    initialTxHash: Hex,
    params: { gasLimit: bigint },
    _gasConfig?: Partial<L1TxUtilsConfig>,
  ): Promise<TransactionReceipt> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const account = this.walletClient.account;

    // Retry a few times, in case the tx is not yet propagated.
    const tx = await retry<GetTransactionReturnType>(
      () => this.publicClient.getTransaction({ hash: initialTxHash }),
      `Getting L1 transaction ${initialTxHash}`,
      makeBackoff([1, 2, 3]),
      this.logger,
      true,
    );

    if (tx?.nonce === undefined || tx?.nonce === null) {
      throw new Error(`Failed to get L1 transaction ${initialTxHash} nonce`);
    }
    const nonce = tx.nonce;

    const txHashes = new Set<Hex>([initialTxHash]);
    let currentTxHash = initialTxHash;
    let attempts = 0;
    let lastAttemptSent = Date.now();
    const initialTxTime = lastAttemptSent;
    let txTimedOut = false;

    while (!txTimedOut) {
      try {
        const currentNonce = await this.publicClient.getTransactionCount({ address: account.address });
        if (currentNonce > nonce) {
          for (const hash of txHashes) {
            try {
              const receipt = await this.publicClient.getTransactionReceipt({ hash });
              if (receipt) {
                this.logger?.debug(`L1 Transaction ${hash} confirmed`);
                if (receipt.status === 'reverted') {
                  this.logger?.error(`L1 Transaction ${hash} reverted`);
                }
                return receipt;
              }
            } catch (err) {
              if (err instanceof Error && err.message.includes('reverted')) {
                throw err;
              }
            }
          }
        }

        // Retry a few times, in case the tx is not yet propagated.
        const tx = await retry<GetTransactionReturnType>(
          () => this.publicClient.getTransaction({ hash: currentTxHash }),
          `Getting L1 transaction ${currentTxHash}`,
          makeBackoff([1, 2, 3]),
          this.logger,
          true,
        );
        const timePassed = Date.now() - lastAttemptSent;

        if (tx && timePassed < gasConfig.stallTimeMs!) {
          this.logger?.debug(`L1 Transaction ${currentTxHash} pending. Time passed: ${timePassed}ms`);

          // Check timeout before continuing
          if (gasConfig.txTimeoutMs) {
            txTimedOut = Date.now() - initialTxTime > gasConfig.txTimeoutMs;
            if (txTimedOut) {
              break;
            }
          }

          await sleep(gasConfig.checkIntervalMs!);
          continue;
        }

        if (timePassed > gasConfig.stallTimeMs! && attempts < gasConfig.maxAttempts!) {
          attempts++;
          const newGasPrice = await this.getGasPrice(
            gasConfig,
            attempts,
            tx.maxFeePerGas && tx.maxPriorityFeePerGas
              ? { maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas }
              : undefined,
          );

          this.logger?.debug(
            `L1 Transaction ${currentTxHash} appears stuck. Attempting speed-up ${attempts}/${gasConfig.maxAttempts} ` +
              `with new priority fee ${formatGwei(newGasPrice.maxPriorityFeePerGas)} gwei`,
          );

          currentTxHash = await this.walletClient.sendTransaction({
            ...request,
            nonce,
            gas: params.gasLimit,
            maxFeePerGas: newGasPrice.maxFeePerGas,
            maxPriorityFeePerGas: newGasPrice.maxPriorityFeePerGas,
          });

          txHashes.add(currentTxHash);
          lastAttemptSent = Date.now();
        }
        await sleep(gasConfig.checkIntervalMs!);
      } catch (err: any) {
        this.logger?.warn(`Error monitoring tx ${currentTxHash}:`, err);
        if (err.message?.includes('reverted')) {
          throw err;
        }
        await sleep(gasConfig.checkIntervalMs!);
      }
      // Check if tx has timed out.
      if (gasConfig.txTimeoutMs) {
        txTimedOut = Date.now() - initialTxTime > gasConfig.txTimeoutMs!;
      }
    }
    throw new Error(`L1 Transaction ${currentTxHash} timed out`);
  }

  /**
   * Sends a transaction and monitors it until completion
   * @param request - The transaction request (to, data, value)
   * @param gasConfig - Optional gas configuration
   * @returns The receipt of the successful transaction
   */
  public async sendAndMonitorTransaction(
    request: L1TxRequest,
    gasConfig?: Partial<L1TxUtilsConfig> & { fixedGas?: bigint },
  ): Promise<TransactionReceipt> {
    const { txHash, gasLimit } = await this.sendTransaction(request, gasConfig);
    return this.monitorTransaction(request, txHash, { gasLimit }, gasConfig);
  }

  /**
   * Gets the current gas price with bounds checking
   */
  private async getGasPrice(
    _gasConfig?: L1TxUtilsConfig,
    attempt: number = 0,
    previousGasPrice?: typeof attempt extends 0 ? never : GasPrice,
  ): Promise<GasPrice> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const block = await this.publicClient.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas ?? 0n;

    // Get initial priority fee from the network
    let priorityFee = await this.publicClient.estimateMaxPriorityFeePerGas();
    let maxFeePerGas = baseFee;

    // Bump base fee so it's valid for next blocks if it stalls
    const numBlocks = Math.ceil(gasConfig.stallTimeMs! / BLOCK_TIME_MS);
    for (let i = 0; i < numBlocks; i++) {
      // each block can go up 12.5% from previous baseFee
      maxFeePerGas = (maxFeePerGas * (1_000n + 125n)) / 1_000n;
    }

    if (attempt > 0) {
      const configBump =
        gasConfig.priorityFeeRetryBumpPercentage ?? defaultL1TxUtilsConfig.priorityFeeRetryBumpPercentage!;
      const bumpPercentage =
        configBump > MIN_REPLACEMENT_BUMP_PERCENTAGE ? configBump : MIN_REPLACEMENT_BUMP_PERCENTAGE;

      // Calculate minimum required fees based on previous attempt
      const minPriorityFee = (previousGasPrice!.maxPriorityFeePerGas * (100n + bumpPercentage)) / 100n;
      const minMaxFee = (previousGasPrice!.maxFeePerGas * (100n + bumpPercentage)) / 100n;

      // Add priority fee to maxFeePerGas
      maxFeePerGas += priorityFee;

      // Use maximum between current network values and minimum required values
      priorityFee = priorityFee > minPriorityFee ? priorityFee : minPriorityFee;
      maxFeePerGas = maxFeePerGas > minMaxFee ? maxFeePerGas : minMaxFee;
    } else {
      // first attempt, just bump priority fee
      priorityFee = (priorityFee * (100n + (gasConfig.priorityFeeBumpPercentage || 0n))) / 100n;
      maxFeePerGas += priorityFee;
    }

    // Ensure we don't exceed maxGwei
    const maxGweiInWei = gasConfig.maxGwei! * WEI_CONST;
    maxFeePerGas = maxFeePerGas > maxGweiInWei ? maxGweiInWei : maxFeePerGas;

    // Ensure priority fee doesn't exceed max fee
    const maxPriorityFeePerGas = priorityFee > maxFeePerGas ? maxFeePerGas : priorityFee;

    this.logger?.debug(
      `Gas price calculation (attempt ${attempt}): baseFee=${formatGwei(baseFee)}, ` +
        `maxPriorityFee=${formatGwei(maxPriorityFeePerGas)}, maxFee=${formatGwei(maxFeePerGas)}`,
    );

    return { maxFeePerGas, maxPriorityFeePerGas };
  }

  /**
   * Estimates gas and adds buffer
   */
  public async estimateGas(account: Account, request: L1TxRequest, _gasConfig?: L1TxUtilsConfig): Promise<bigint> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const initialEstimate = await this.publicClient.estimateGas({ account, ...request });

    // Add buffer based on either fixed amount or percentage
    const withBuffer = initialEstimate + (initialEstimate * (gasConfig.gasLimitBufferPercentage ?? 0n)) / 100n;

    return withBuffer;
  }
}
