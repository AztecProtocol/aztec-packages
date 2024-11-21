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
   * Sends a transaction with gas estimation and pricing
   * @param request - The transaction request (to, data, value)
   * @param gasConfig - Optional gas configuration
   * @returns The transaction hash and parameters used
   */
  public async sendTransaction(
    request: L1TxRequest,
    _gasConfig?: Partial<L1TxUtilsConfig>,
  ): Promise<{ txHash: Hex; gasLimit: bigint; gasPrice: GasPrice }> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const account = this.walletClient.account;

    const gasLimit = await this.estimateGas(account, request);
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

    const tx = await this.publicClient.getTransaction({ hash: initialTxHash });
    if (tx?.nonce === undefined || tx?.nonce === null) {
      throw new Error(`Failed to get L1 transaction ${initialTxHash} nonce`);
    }
    const nonce = tx.nonce;

    const txHashes = new Set<Hex>([initialTxHash]);
    let currentTxHash = initialTxHash;
    let attempts = 0;
    let lastSeen = Date.now();

    while (true) {
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
                  throw new Error(`Transaction ${hash} reverted`);
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

        const tx = await this.publicClient.getTransaction({ hash: currentTxHash });
        const timePassed = Date.now() - lastSeen;

        if (tx && timePassed < gasConfig.stallTimeMs!) {
          this.logger?.debug(`L1 Transaction ${currentTxHash} pending. Time passed: ${timePassed}ms`);
          lastSeen = Date.now();
          await sleep(gasConfig.checkIntervalMs!);
          continue;
        }

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
            gas: params.gasLimit,
            maxFeePerGas: newGasPrice.maxFeePerGas,
            maxPriorityFeePerGas: newGasPrice.maxPriorityFeePerGas,
          });

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
   * Sends a transaction and monitors it until completion
   * @param request - The transaction request (to, data, value)
   * @param gasConfig - Optional gas configuration
   * @returns The receipt of the successful transaction
   */
  public async sendAndMonitorTransaction(
    request: L1TxRequest,
    gasConfig?: Partial<L1TxUtilsConfig>,
  ): Promise<TransactionReceipt> {
    const { txHash, gasLimit } = await this.sendTransaction(request, gasConfig);
    return this.monitorTransaction(request, txHash, { gasLimit }, gasConfig);
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
      priorityFee =
        (priorityFee *
          (100n +
            (gasConfig.priorityFeeBumpPercentage ?? defaultL1TxUtilsConfig.priorityFeeBumpPercentage!) *
              BigInt(attempt))) /
        100n;
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
