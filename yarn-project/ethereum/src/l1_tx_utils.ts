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
  type BlockOverrides,
  type Chain,
  type GetTransactionReturnType,
  type Hex,
  type HttpTransport,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  type PublicClient,
  type StateOverride,
  type TransactionReceipt,
  type WalletClient,
  formatGwei,
} from 'viem';

import { formatViemError } from './utils.js';

// 1_000_000_000 Gwei = 1 ETH
// 1_000_000_000 Wei = 1 Gwei
// 1_000_000_000_000_000_000 Wei = 1 ETH

const WEI_CONST = 1_000_000_000n;

// setting a minimum bump percentage to 10% due to geth's implementation
// https://github.com/ethereum/go-ethereum/blob/e3d61e6db028c412f74bc4d4c7e117a9e29d0de0/core/txpool/legacypool/list.go#L298
const MIN_REPLACEMENT_BUMP_PERCENTAGE = 10;

// setting a minimum bump percentage to 100% due to geth's implementation
// https://github.com/ethereum/go-ethereum/blob/e3d61e6db028c412f74bc4d4c7e117a9e29d0de0/core/txpool/blobpool/config.go#L34
const MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE = 100;

// Avg ethereum block time is ~12s
const BLOCK_TIME_MS = 12_000;

export interface L1TxUtilsConfig {
  /**
   * How much to increase calculated gas limit.
   */
  gasLimitBufferPercentage?: number;
  /**
   * Maximum gas price in gwei
   */
  maxGwei?: bigint;
  /**
   * Minimum gas price in gwei
   */
  minGwei?: bigint;
  /**
   * Maximum blob fee per gas in gwei
   */
  maxBlobGwei?: bigint;
  /**
   * Priority fee bump percentage
   */
  priorityFeeBumpPercentage?: number;
  /**
   * How much to increase priority fee by each attempt (percentage)
   */
  priorityFeeRetryBumpPercentage?: number;
  /**
   * Fixed priority fee per gas in Gwei. Overrides any priority fee bump percentage config
   */
  fixedPriorityFeePerGas?: number;
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
    description: 'How much to increase calculated gas limit by (percentage)',
    env: 'L1_GAS_LIMIT_BUFFER_PERCENTAGE',
    ...numberConfigHelper(20),
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
  maxBlobGwei: {
    description: 'Maximum blob fee per gas in gwei',
    env: 'L1_BLOB_FEE_PER_GAS_MAX',
    ...bigintConfigHelper(1_500n),
  },
  priorityFeeBumpPercentage: {
    description: 'How much to increase priority fee by each attempt (percentage)',
    env: 'L1_PRIORITY_FEE_BUMP_PERCENTAGE',
    ...numberConfigHelper(20),
  },
  priorityFeeRetryBumpPercentage: {
    description: 'How much to increase priority fee by each retry attempt (percentage)',
    env: 'L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE',
    ...numberConfigHelper(50),
  },
  fixedPriorityFeePerGas: {
    description: 'Fixed priority fee per gas in Gwei. Overrides any priority fee bump percentage',
    env: 'L1_FIXED_PRIORITY_FEE_PER_GAS',
    ...numberConfigHelper(0),
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
    ...numberConfigHelper(45_000),
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
  maxFeePerBlobGas?: bigint;
}

export interface GasPrice {
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
    _gasConfig?: Partial<L1TxUtilsConfig> & { fixedGas?: bigint; gasLimit?: bigint; txTimeoutAt?: Date },
    blobInputs?: L1BlobInputs,
  ): Promise<{ txHash: Hex; gasLimit: bigint; gasPrice: GasPrice }> {
    try {
      const gasConfig = { ...this.config, ..._gasConfig };
      const account = this.walletClient.account;
      let gasLimit: bigint;

      if (gasConfig.fixedGas) {
        gasLimit = gasConfig.fixedGas;
      } else if (gasConfig.gasLimit) {
        gasLimit = this.bumpGasLimit(gasConfig.gasLimit, gasConfig);
      } else {
        gasLimit = await this.estimateGas(account, request);
      }

      const gasPrice = await this.getGasPrice(gasConfig, !!blobInputs);

      if (gasConfig.txTimeoutAt && Date.now() > gasConfig.txTimeoutAt.getTime()) {
        throw new Error('Transaction timed out before sending');
      }

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
        ...(gasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(gasPrice.maxFeePerBlobGas) }),
      });

      return { txHash, gasLimit, gasPrice };
    } catch (err: any) {
      const { message, ...error } = formatViemError(err);
      this.logger?.error(`Failed to send transaction`, message, error);
      throw { ...error, message };
    }
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
    _gasConfig?: Partial<L1TxUtilsConfig> & { txTimeoutAt?: Date },
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
    const isTimedOut = () =>
      (gasConfig.txTimeoutAt && Date.now() > gasConfig.txTimeoutAt.getTime()) ||
      (gasConfig.txTimeoutMs !== undefined && Date.now() - initialTxTime > gasConfig.txTimeoutMs) ||
      false;

    while (!txTimedOut) {
      try {
        const currentNonce = await this.publicClient.getTransactionCount({ address: account.address });
        if (currentNonce > nonce) {
          for (const hash of txHashes) {
            try {
              const receipt = await this.publicClient.getTransactionReceipt({ hash });
              if (receipt) {
                if (receipt.status === 'reverted') {
                  this.logger?.error(`L1 transaction ${hash} reverted`, receipt);
                } else {
                  this.logger?.debug(`L1 transaction ${hash} mined`);
                }
                return receipt;
              }
            } catch (err) {
              if (err instanceof Error && err.message.includes('reverted')) {
                throw formatViemError(err);
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
          txTimedOut = isTimedOut();
          if (txTimedOut) {
            break;
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
            {
              maxFeePerGas: formatGwei(newGasPrice.maxFeePerGas),
              maxPriorityFeePerGas: formatGwei(newGasPrice.maxPriorityFeePerGas),
              ...(newGasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(newGasPrice.maxFeePerBlobGas) }),
            },
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
        const { message, ...error } = formatViemError(err);
        this.logger?.warn(`Error monitoring tx ${currentTxHash}:`, message);
        if (err.message?.includes('reverted')) {
          throw { ...error, message };
        }
        await sleep(gasConfig.checkIntervalMs!);
      }
      // Check if tx has timed out.
      txTimedOut = isTimedOut();
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
    gasConfig?: Partial<L1TxUtilsConfig> & { fixedGas?: bigint; gasLimit?: bigint; txTimeoutAt?: Date },
    blobInputs?: L1BlobInputs,
  ): Promise<{ receipt: TransactionReceipt; gasPrice: GasPrice }> {
    const { txHash, gasLimit, gasPrice } = await this.sendTransaction(request, gasConfig, blobInputs);
    const receipt = await this.monitorTransaction(request, txHash, { gasLimit }, gasConfig, blobInputs);
    return { receipt, gasPrice };
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

    let priorityFee: bigint;
    if (gasConfig.fixedPriorityFeePerGas) {
      this.logger?.debug('Using fixed priority fee per gas', {
        fixedPriorityFeePerGas: gasConfig.fixedPriorityFeePerGas,
      });
      // try to maintain precision up to 1000000 wei
      priorityFee = BigInt(gasConfig.fixedPriorityFeePerGas * 1_000_000) * (WEI_CONST / 1_000_000n);
    } else {
      // Get initial priority fee from the network
      priorityFee = await this.publicClient.estimateMaxPriorityFeePerGas();
    }
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
      // multiply by 100 & divide by 100 to maintain some precision
      const minPriorityFee =
        (previousGasPrice!.maxPriorityFeePerGas * (100_00n + BigInt(bumpPercentage * 1_00))) / 100_00n;
      const minMaxFee = (previousGasPrice!.maxFeePerGas * (100_00n + BigInt(bumpPercentage * 1_00))) / 100_00n;

      // Add priority fee to maxFeePerGas
      maxFeePerGas += priorityFee;

      // Use maximum between current network values and minimum required values
      priorityFee = priorityFee > minPriorityFee ? priorityFee : minPriorityFee;
      maxFeePerGas = maxFeePerGas > minMaxFee ? maxFeePerGas : minMaxFee;
    } else {
      // first attempt, just bump priority fee, unless it's a fixed config
      // multiply by 100 & divide by 100 to maintain some precision
      if (!gasConfig.fixedPriorityFeePerGas) {
        priorityFee = (priorityFee * (100_00n + BigInt((gasConfig.priorityFeeBumpPercentage || 0) * 1_00))) / 100_00n;
      }
      maxFeePerGas += priorityFee;
    }

    // Ensure we don't exceed maxGwei
    const maxGweiInWei = gasConfig.maxGwei! * WEI_CONST;
    maxFeePerGas = maxFeePerGas > maxGweiInWei ? maxGweiInWei : maxFeePerGas;

    // Ensure we don't exceed maxBlobGwei
    if (maxFeePerBlobGas) {
      const maxBlobGweiInWei = gasConfig.maxBlobGwei! * WEI_CONST;
      maxFeePerBlobGas = maxFeePerBlobGas > maxBlobGweiInWei ? maxBlobGweiInWei : maxFeePerBlobGas;
    }

    // Ensure priority fee doesn't exceed max fee
    const maxPriorityFeePerGas = priorityFee > maxFeePerGas ? maxFeePerGas : priorityFee;

    if (attempt > 0 && previousGasPrice?.maxFeePerBlobGas) {
      const bumpPercentage =
        gasConfig.priorityFeeRetryBumpPercentage! > MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE
          ? gasConfig.priorityFeeRetryBumpPercentage!
          : MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE;

      // calculate min blob fee based on previous attempt
      const minBlobFee = (previousGasPrice.maxFeePerBlobGas * (100_00n + BigInt(bumpPercentage * 1_00))) / 100_00n;

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
      const gasPrice = await this.getGasPrice(gasConfig, true, 0);
      initialEstimate = (
        await this.walletClient.prepareTransactionRequest({
          account,
          ...request,
          ..._blobInputs,
          maxFeePerBlobGas: gasPrice.maxFeePerBlobGas!,
        })
      )?.gas;
      this.logger?.debug('Gas used in estimateGas by blob tx', { gas: initialEstimate });
    } else {
      initialEstimate = await this.publicClient.estimateGas({ account, ...request });
      this.logger?.debug('Gas used in estimateGas by non-blob tx', { gas: initialEstimate });
    }

    // Add buffer based on either fixed amount or percentage
    const withBuffer = this.bumpGasLimit(initialEstimate, gasConfig);

    return withBuffer;
  }

  public async simulateGasUsed(
    request: L1TxRequest,
    blockOverrides: BlockOverrides<bigint, number> = {},
    stateOverrides: StateOverride = [],
    _gasConfig?: L1TxUtilsConfig,
  ): Promise<bigint> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const gasPrice = await this.getGasPrice(gasConfig, false);

    // "data": "0x164552d800000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000460000000000000000000000000000000000000000000000000000000000000048000000000000000000000000000000000000000000000000000000000000009601af87f30971f9ecdebb7a0cd9a35d37804b2ae9846482c39dc6a41d6b4576f041ec4e50a18fe245f5b7abaf93810a85990e2362d242aa9dec4f336a43d0a96060000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000038000000000000000000000000000000000000000000000000000000000000002880237797d6a2c04d20d4fa06b74482bd970ccd51a43d9b05b57e9b91fa1ae1cae00000001000000000000000000000000000000000000000000000000000000000000000200056e3dd569ccf68f705a2ea9cf03da3955838d981c674350d5a946b9c25f1500089a9d421a82c4a25f7acbebe69e638d5b064fa8a60e018793dcb0be53752c00f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb2e33ee2008411c04b99c24b313513d097a0d21a5040b6193d1f978b8226892d60000001001d8759f40db60c447bcf9c3caa0714b86ef8ebbfb2305506558d1a2d087d473000000802d0e4f11e3e53213b3453206e479ba3a4c2125c66729c6f17ab1f8703045cd91000001000fb3cd33107e1f0a7b26ec9ce709cf97442b2b7dfaf527844d9169d6d207bc7000000083000000000000000000000000000000000000000000000000000000000000053900000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000678e42020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c9c6dedc400000000000000000000000000000000000000000000000000146cf4c4136e080000000000000000000000000000000000000000000000000000000000019ea200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000021c544a2d450a070fe5c83265dbebc60b49aea256e8dd4cafcc0ca8caedb329ee0f2b3aecfa548754273f007b59ab579c4e26b36c388cbc5afc4e8d0d74c3549c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004ac00000002001c544a2d450a070fe5c83265dbebc60b49aea256e8dd4cafcc0ca8caedb329ee0000000000000000000000000000000000000000000000000002e80d55cc2c0001289ef0d8eaeb8f3d4b4fbdd79c9654511dd2dca942f0dbd86562a1b9690eb848020008b025a09cdf3ca39e46b50b7afea26e8116153f323ebe5d672af8418526af1257a3e07b62dfaae78bc58cf9dbfe605958645cf28aef9afbc03e82e3a964010000011e33df95746d8f981f221481d0bed30e3bb19d40042f25dfacd2e56f86649ddd002f40da22100c7977377468089b9730a1ace9edfa224db93c5dba9486792222006340a142be3eaf891b2b7a692e8c4a4789c6634444aff8ce38a48a1482985000ad3f3c5033520fe7a9bcd317e870321e513a00000000000000000000000000000000ff67c2ba070aff482afbcce91b5c5a5e11c8eed141d2e282cf9d81034b00aed5337b72e67040368c341f285ba4f50727a0109b3b9b5a6bc3f1846dc3ed00751215d09b292858781217bab2501973a662103a2f253847667aad31162ee200dcc9b49c9b36d0e8ab936b8eb001d726af2383c7f26dcfcb7015f7fc22633c00b405607826326bf45577bc8ab6e4720eed3e5edbe90baefa9c7d19c6abb30b009f7a9e04910576a526e7f446c51faed806b1c28ccf0608eb7ee1809580f67100add059714ab88fdc03a0887fbcec98056337c5025945ffafa14bf755880956006c2f3d398493ec005af684f515289269ae432f2fea795151a2d89aaf0b3a96008119f06b0e9b8287da7c2a9e34168d682606addef9255b52abece5aad5e7a800ac940d59da0065ad91f3ec6a37c17152a5dc11bcf53ece2b02de53a989c7ee007f4ce581de83172f5e055a62947e76e8b061914e28675dcbe49d571a2636d800ce78f767184384ccc61e78ecf275574fa5a293d9019cebc244f4c3f4318f380070491506ab3389843b9642dec9a01554adfefc5ec416046b39553c01bb89f200e02c874b0014bd61a5b27f96a37cc30317cbfd76cda7c5c5efb39dcb1ca5b700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000f2b3aecfa548754273f007b59ab579c4e26b36c388cbc5afc4e8d0d74c3549c000000000000000000000000000000000000000000000000001184e76e47420800012bb4fb3a4de5840e9adc1810b15558785d85e23dcb16470f1f1c302cf165b5ed000309e66f7471b449f587c43a13a2089a2cab5475b5bce5b62ae1d537efb01a2de400000000000000000000000000000000000000000000000ad77d377357d8bdf8184dd2a6409e58c268839b38fd12b9063e970cdc076c70d522c507fba1732cbe000000000000000000000000000000000000000000000000000000000000dead064a8cbbf0b7cdf1cd038b49763d85acd50724ba2f09aa2052812d39f56c0b4e000000000000000000000000a0254526c4079c4a66b45ddacfc0809d5b8cde47000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c10101cf2677d0cb898b30e8d1adb83dd8aff2ba513896075b47482b3e26a6b8e4e511fd483c434b311fb29310f8ffa63eed594f8d8d9e716a87060d3c0b34962c726547f557dead24c186d0ffa32447f269a82df13e8a7a71429e2b1575de0d926ea99a8900bc71a904f7d08e5fa9fd00aac2530fee73a48b3799dd320162f15e23df0b183c5c0609062e3dd123a515e191842bac96e1df169b6075eb436bd250c031d37a21d414e9c49281b5d8e3933c089d03a95c997488a3baccc455be415f3400000000000000000000000000000000000000000000000000000000000000",
    // "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    // "to": "0x859EA5Ab45ec39658931eBB5A1ac08e29ed80aBf",
    // "nonce": "0x17",
    // "maxFeePerGas": "0x10",
    // "maxPriorityFeePerGas": "0x1",
    // "gas": "0x520800"

    try {
      const result = await this.publicClient.simulate({
        validation: true,
        blocks: [
          {
            blockOverrides,
            stateOverrides,
            calls: [
              {
                from: this.walletClient.account.address,
                to: request.to!,
                data: request.data,
                maxFeePerGas: gasPrice.maxFeePerGas,
                maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
                gas: 12_000_000n,
                // gasLimit: 12_000_000n * WEI_CONST,
              },
            ],
          },
        ],
      });
      this.logger?.debug(`Gas used in simulation: ${result[0].calls[0].gasUsed}`, {
        result,
      });
      if (result[0].calls[0].status === 'failure') {
        this.logger?.error('Simulation failed', {
          error: result[0].calls[0].error,
        });
        throw new Error(`Simulation failed with error: ${result[0].calls[0].error.message}`);
      }
      return result[0].gasUsed;
    } catch (err) {
      if (err instanceof MethodNotFoundRpcError || err instanceof MethodNotSupportedRpcError) {
        // Node doesn't support simulation, return -1n gas estimate
        this.logger?.error('Node does not support simulation API');
        return -1n;
      }
      throw err;
    }
  }

  private bumpGasLimit(gasLimit: bigint, gasConfig: L1TxUtilsConfig): bigint {
    return gasLimit + (gasLimit * BigInt((gasConfig.gasLimitBufferPercentage || 0) * 1_00)) / 100_00n;
  }
}
