import { times } from '@aztec/foundation/collection';
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

// setting a minimum bump percentage to 100% due to geth's implementation
// https://github.com/ethereum/go-ethereum/blob/e3d61e6db028c412f74bc4d4c7e117a9e29d0de0/core/txpool/blobpool/config.go#L34
const MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE = 100n;

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
  /**
   * How many attempts will be done to get a tx after it was sent?
   * First attempt is done at 1s, second at 2s, third at 3s, etc.
   */
  txPropagationMaxQueryAttempts?: number;
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
  txPropagationMaxQueryAttempts: {
    description: 'How many attempts will be done to get a tx after it was sent',
    env: 'L1_TX_PROPAGATION_MAX_QUERY_ATTEMPTS',
    ...numberConfigHelper(3),
  },
};

export const defaultL1TxUtilsConfig = getDefaultConfig<L1TxUtilsConfig>(l1TxUtilsConfigMappings);

export interface L1TxRequest {
  to: Address | null;
  data: Hex;
  value?: bigint;
}

export interface L1BlobInputs {
  blobs: Uint8Array[];
  kzg: any;
  maxFeePerBlobGas: bigint;
}

interface GasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerBlobGas?: bigint;
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
    blobInputs?: L1BlobInputs,
  ): Promise<{ txHash: Hex; gasLimit: bigint; gasPrice: GasPrice }> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const account = this.walletClient.account;
    let gasLimit: bigint;

    if (gasConfig.fixedGas) {
      gasLimit = gasConfig.fixedGas;
    } else {
      gasLimit = await this.estimateGas(account, request);
    }

    const gasPrice = await this.getGasPrice(gasConfig, !!blobInputs);

    let txHash: Hex;
    if (blobInputs) {
      txHash = await this.walletClient.sendTransaction({
        ...request,
        ...blobInputs,
        gas: gasLimit,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
        maxFeePerBlobGas: gasPrice.maxFeePerBlobGas!,
      });
    } else {
      txHash = await this.walletClient.sendTransaction({
        ...request,
        gas: gasLimit,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      });
    }
    this.logger?.verbose(`Sent L1 transaction ${txHash}`, {
      gasLimit,
      maxFeePerGas: formatGwei(gasPrice.maxFeePerGas),
      maxPriorityFeePerGas: formatGwei(gasPrice.maxPriorityFeePerGas),
    });

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
    _blobInputs?: L1BlobInputs,
  ): Promise<TransactionReceipt> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const account = this.walletClient.account;
    const blobInputs = _blobInputs || {};
    const makeGetTransactionBackoff = () =>
      makeBackoff(times(gasConfig.txPropagationMaxQueryAttempts ?? 3, i => i + 1));

    // Retry a few times, in case the tx is not yet propagated.
    const tx = await retry<GetTransactionReturnType>(
      () => this.publicClient.getTransaction({ hash: initialTxHash }),
      `Getting L1 transaction ${initialTxHash}`,
      makeGetTransactionBackoff(),
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
                this.logger?.debug(`L1 transaction ${hash} mined`);
                if (receipt.status === 'reverted') {
                  this.logger?.error(`L1 transaction ${hash} reverted`);
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
          makeGetTransactionBackoff(),
          this.logger,
          true,
        );
        const timePassed = Date.now() - lastAttemptSent;

        if (tx && timePassed < gasConfig.stallTimeMs!) {
          this.logger?.debug(`L1 transaction ${currentTxHash} pending. Time passed: ${timePassed}ms.`);

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
            !!blobInputs,
            attempts,
            tx.maxFeePerGas && tx.maxPriorityFeePerGas
              ? {
                  maxFeePerGas: tx.maxFeePerGas,
                  maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
                  maxFeePerBlobGas: tx.maxFeePerBlobGas,
                }
              : undefined,
          );

          this.logger?.debug(
            `L1 transaction ${currentTxHash} appears stuck. Attempting speed-up ${attempts}/${gasConfig.maxAttempts} ` +
              `with new priority fee ${formatGwei(newGasPrice.maxPriorityFeePerGas)} gwei`,
          );

          currentTxHash = await this.walletClient.sendTransaction({
            ...request,
            ...blobInputs,
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
    throw new Error(`L1 transaction ${currentTxHash} timed out`);
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
    blobInputs?: L1BlobInputs,
  ): Promise<TransactionReceipt> {
    const { txHash, gasLimit } = await this.sendTransaction(request, gasConfig, blobInputs);
    return this.monitorTransaction(request, txHash, { gasLimit }, gasConfig, blobInputs);
  }

  /**
   * Gets the current gas price with bounds checking
   */
  private async getGasPrice(
    _gasConfig?: L1TxUtilsConfig,
    isBlobTx: boolean = false,
    attempt: number = 0,
    previousGasPrice?: typeof attempt extends 0 ? never : GasPrice,
  ): Promise<GasPrice> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const block = await this.publicClient.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas ?? 0n;

    // Get blob base fee if available
    let blobBaseFee = 0n;
    try {
      const blobBaseFeeHex = await this.publicClient.request({ method: 'eth_blobBaseFee' });
      blobBaseFee = BigInt(blobBaseFeeHex);
      this.logger?.debug('Blob base fee:', { blobBaseFee: formatGwei(blobBaseFee) });
    } catch {
      this.logger?.warn('Failed to get blob base fee', attempt);
    }

    // Get initial priority fee from the network
    let priorityFee = await this.publicClient.estimateMaxPriorityFeePerGas();
    let maxFeePerGas = baseFee;

    let maxFeePerBlobGas = blobBaseFee;

    // Bump base fee so it's valid for next blocks if it stalls
    const numBlocks = Math.ceil(gasConfig.stallTimeMs! / BLOCK_TIME_MS);
    for (let i = 0; i < numBlocks; i++) {
      // each block can go up 12.5% from previous baseFee
      maxFeePerGas = (maxFeePerGas * (1_000n + 125n)) / 1_000n;
      // same for blob gas fee
      maxFeePerBlobGas = (maxFeePerBlobGas * (1_000n + 125n)) / 1_000n;
    }

    if (attempt > 0) {
      const configBump =
        gasConfig.priorityFeeRetryBumpPercentage ?? defaultL1TxUtilsConfig.priorityFeeRetryBumpPercentage!;

      // if this is a blob tx, we have to use the blob bump percentage
      const minBumpPercentage = isBlobTx ? MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE : MIN_REPLACEMENT_BUMP_PERCENTAGE;

      const bumpPercentage = configBump > minBumpPercentage ? configBump : minBumpPercentage;

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

    if (attempt > 0 && previousGasPrice?.maxFeePerBlobGas) {
      const bumpPercentage =
        gasConfig.priorityFeeRetryBumpPercentage! > MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE
          ? gasConfig.priorityFeeRetryBumpPercentage!
          : MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE;

      // calculate min blob fee based on previous attempt
      const minBlobFee = (previousGasPrice.maxFeePerBlobGas * (100n + bumpPercentage)) / 100n;

      // use max between current network values and min required values
      maxFeePerBlobGas = maxFeePerBlobGas > minBlobFee ? maxFeePerBlobGas : minBlobFee;
    }

    this.logger?.debug(`Computed gas price`, {
      attempt,
      baseFee: formatGwei(baseFee),
      maxFeePerGas: formatGwei(maxFeePerGas),
      maxPriorityFeePerGas: formatGwei(maxPriorityFeePerGas),
      ...(maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(maxFeePerBlobGas) }),
    });

    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
      ...(maxFeePerBlobGas && { maxFeePerBlobGas: maxFeePerBlobGas }),
    };
  }

  /**
   * Estimates gas and adds buffer
   */
  public async estimateGas(
    account: Account,
    request: L1TxRequest,
    _gasConfig?: L1TxUtilsConfig,
    _blobInputs?: L1BlobInputs,
  ): Promise<bigint> {
    const gasConfig = { ...this.config, ..._gasConfig };
    let initialEstimate = 0n;
    // Viem does not allow blobs to be sent via public client's estimate gas, so any estimation will fail.
    // Strangely, the only way to get gas and send blobs is prepareTransactionRequest().
    // See: https://github.com/wevm/viem/issues/2075
    if (_blobInputs) {
      initialEstimate = (await this.walletClient.prepareTransactionRequest({ account, ...request, ..._blobInputs }))
        .gas;
    } else {
      initialEstimate = await this.publicClient.estimateGas({ account, ...request });
    }

    // Add buffer based on either fixed amount or percentage
    const withBuffer = initialEstimate + (initialEstimate * (gasConfig.gasLimitBufferPercentage ?? 0n)) / 100n;

    return withBuffer;
  }
}
