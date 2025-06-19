import { compactArray, times } from '@aztec/foundation/collection';
import {
  type ConfigMappingsType,
  bigintConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import {
  type Abi,
  type Account,
  type Address,
  type BaseError,
  type BlockOverrides,
  type ContractFunctionExecutionError,
  type GetTransactionReturnType,
  type Hex,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  type StateOverride,
  type TransactionReceipt,
  decodeErrorResult,
  formatGwei,
  getContractError,
  hexToBytes,
} from 'viem';

import { type ExtendedViemWalletClient, type ViemClient, isExtendedClient } from './types.js';
import { formatViemError } from './utils.js';

// 1_000_000_000 Gwei = 1 ETH
// 1_000_000_000 Wei = 1 Gwei
// 1_000_000_000_000_000_000 Wei = 1 ETH

const WEI_CONST = 1_000_000_000n;

// @note using this large gas limit to avoid the issue of `gas limit too low` when estimating gas in reth
const LARGE_GAS_LIMIT = 12_000_000n;

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
  maxGwei: {
    description: 'Maximum gas price in gwei',
    env: 'L1_GAS_PRICE_MAX',
    ...bigintConfigHelper(500n),
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
    ...numberConfigHelper(1_000),
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

export function getL1TxUtilsConfigEnvVars(): L1TxUtilsConfig {
  return getConfigFromMappings(l1TxUtilsConfigMappings);
}

export interface L1TxRequest {
  to: Address | null;
  data?: Hex;
  value?: bigint;
  abi?: Abi;
}

export type L1GasConfig = Partial<L1TxUtilsConfig> & { gasLimit?: bigint; txTimeoutAt?: Date };

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

export type TransactionStats = {
  /** Address of the sender. */
  sender: string;
  /** Hash of the transaction. */
  transactionHash: string;
  /** Size in bytes of the tx calldata */
  calldataSize: number;
  /** Gas required to pay for the calldata inclusion (depends on size and number of zeros)  */
  calldataGas: number;
};

export class ReadOnlyL1TxUtils {
  public readonly config: L1TxUtilsConfig;
  protected interrupted = false;

  constructor(
    public client: ViemClient,
    protected logger: Logger = createLogger('ReadOnlyL1TxUtils'),
    config?: Partial<L1TxUtilsConfig>,
    protected debugMaxGasLimit: boolean = false,
  ) {
    this.config = {
      ...defaultL1TxUtilsConfig,
      ...(config || {}),
    };
  }

  public interrupt() {
    this.interrupted = true;
  }

  public restart() {
    this.interrupted = false;
  }

  public getBlock() {
    return this.client.getBlock();
  }

  public getBlockNumber() {
    return this.client.getBlockNumber();
  }

  /**
   * Gets the current gas price with bounds checking
   */
  public async getGasPrice(
    _gasConfig?: L1TxUtilsConfig,
    isBlobTx: boolean = false,
    attempt: number = 0,
    previousGasPrice?: typeof attempt extends 0 ? never : GasPrice,
  ): Promise<GasPrice> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const block = await this.client.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas ?? 0n;

    // Get blob base fee if available
    let blobBaseFee = 0n;
    if (isBlobTx) {
      try {
        blobBaseFee = await this.client.getBlobBaseFee();
        this.logger?.debug('L1 Blob base fee:', { blobBaseFee: formatGwei(blobBaseFee) });
      } catch {
        this.logger?.warn('Failed to get L1 blob base fee', attempt);
      }
    }

    let priorityFee: bigint;
    if (gasConfig.fixedPriorityFeePerGas) {
      this.logger?.debug('Using fixed priority fee per L1 gas', {
        fixedPriorityFeePerGas: gasConfig.fixedPriorityFeePerGas,
      });
      // try to maintain precision up to 1000000 wei
      priorityFee = BigInt(gasConfig.fixedPriorityFeePerGas * 1_000_000) * (WEI_CONST / 1_000_000n);
    } else {
      // Get initial priority fee from the network
      priorityFee = await this.client.estimateMaxPriorityFeePerGas();
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

    this.logger?.debug(`Computed L1 gas price`, {
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
    account: Account | Hex,
    request: L1TxRequest,
    _gasConfig?: L1TxUtilsConfig,
    _blobInputs?: L1BlobInputs,
  ): Promise<bigint> {
    const gasConfig = { ...this.config, ..._gasConfig };
    let initialEstimate = 0n;
    if (_blobInputs) {
      // @note requests with blobs also require maxFeePerBlobGas to be set
      const gasPrice = await this.getGasPrice(gasConfig, true, 0);
      initialEstimate = await this.client.estimateGas({
        account,
        ...request,
        ..._blobInputs,
        maxFeePerBlobGas: gasPrice.maxFeePerBlobGas!,
        gas: LARGE_GAS_LIMIT,
      });

      this.logger?.debug(`L1 gas used in estimateGas by blob tx: ${initialEstimate}`);
    } else {
      initialEstimate = await this.client.estimateGas({ account, ...request, gas: LARGE_GAS_LIMIT });
      this.logger?.debug(`L1 gas used in estimateGas by non-blob tx: ${initialEstimate}`);
    }

    // Add buffer based on either fixed amount or percentage
    const withBuffer = this.bumpGasLimit(initialEstimate, gasConfig);

    return withBuffer;
  }

  async getTransactionStats(txHash: string): Promise<TransactionStats | undefined> {
    const tx = await this.client.getTransaction({ hash: txHash as Hex });
    if (!tx) {
      return undefined;
    }
    const calldata = hexToBytes(tx.input);
    return {
      sender: tx.from.toString(),
      transactionHash: tx.hash,
      calldataSize: calldata.length,
      calldataGas: getCalldataGasUsage(calldata),
    };
  }

  public async tryGetErrorFromRevertedTx(
    data: Hex,
    args: {
      args: readonly any[];
      functionName: string;
      abi: Abi;
      address: Hex;
    },
    blobInputs: (L1BlobInputs & { maxFeePerBlobGas: bigint }) | undefined,
    stateOverride: StateOverride = [],
  ) {
    try {
      await this.client.simulateContract({
        ...args,
        account: this.client.account,
        stateOverride,
      });
      this.logger?.trace('Simulated blob tx', { blobInputs });
      // If the above passes, we have a blob error. We cannot simulate blob txs, and failed txs no longer throw errors.
      // Strangely, the only way to throw the revert reason as an error and provide blobs is prepareTransactionRequest.
      // See: https://github.com/wevm/viem/issues/2075
      // This throws a EstimateGasExecutionError with the custom error information:
      const request = blobInputs
        ? {
            account: this.client.account,
            to: args.address,
            data,
            blobs: blobInputs.blobs,
            kzg: blobInputs.kzg,
            maxFeePerBlobGas: blobInputs.maxFeePerBlobGas,
          }
        : {
            account: this.client.account,
            to: args.address,
            data,
          };
      this.logger?.trace('Preparing tx', { request });
      await this.client.prepareTransactionRequest(request);
      this.logger?.trace('Prepared tx');
      return undefined;
    } catch (simulationErr: any) {
      // If we don't have a ContractFunctionExecutionError, we have a blob related error => use getContractError to get the error msg.
      const contractErr =
        simulationErr.name === 'ContractFunctionExecutionError'
          ? simulationErr
          : getContractError(simulationErr as BaseError, {
              args: [],
              abi: args.abi,
              functionName: args.functionName,
              address: args.address,
            });
      if (contractErr.name === 'ContractFunctionExecutionError') {
        const execErr = contractErr as ContractFunctionExecutionError;
        return tryGetCustomErrorNameContractFunction(execErr);
      }
      this.logger?.error(`Error getting error from simulation`, simulationErr);
    }
  }

  public async simulate(
    request: L1TxRequest & { gas?: bigint; from?: Hex },
    blockOverrides: BlockOverrides<bigint, number> = {},
    stateOverrides: StateOverride = [],
    abi: Abi = RollupAbi,
    _gasConfig?: L1TxUtilsConfig & { fallbackGasEstimate?: bigint },
  ): Promise<{ gasUsed: bigint; result: `0x${string}` }> {
    const gasConfig = { ...this.config, ..._gasConfig };

    const call: any = {
      to: request.to!,
      data: request.data,
      ...(request.from && { from: request.from }),
    };

    return await this._simulate(call, blockOverrides, stateOverrides, gasConfig, abi);
  }

  protected async _simulate(
    call: any,
    blockOverrides: BlockOverrides<bigint, number> = {},
    stateOverrides: StateOverride = [],
    gasConfig: L1TxUtilsConfig & { fallbackGasEstimate?: bigint },
    abi: Abi,
  ) {
    try {
      const result = await this.client.simulateBlocks({
        validation: true,
        blocks: [
          {
            blockOverrides,
            stateOverrides,
            calls: [call],
          },
        ],
      });

      this.logger?.debug(`L1 gas used in simulation: ${result[0].calls[0].gasUsed}`, {
        result,
      });
      if (result[0].calls[0].status === 'failure') {
        this.logger?.error('L1 transaction Simulation failed', {
          error: result[0].calls[0].error,
        });
        const decodedError = decodeErrorResult({
          abi,
          data: result[0].calls[0].data,
        });

        throw new Error(`L1 transaction simulation failed with error: ${decodedError.errorName}`);
      }
      return { gasUsed: result[0].gasUsed, result: result[0].calls[0].data as `0x${string}` };
    } catch (err) {
      if (err instanceof MethodNotFoundRpcError || err instanceof MethodNotSupportedRpcError) {
        if (gasConfig.fallbackGasEstimate) {
          this.logger?.warn(
            `Node does not support eth_simulateV1 API. Using fallback gas estimate: ${gasConfig.fallbackGasEstimate}`,
          );
          return { gasUsed: gasConfig.fallbackGasEstimate, result: '0x' as `0x${string}` };
        }
        this.logger?.error('Node does not support eth_simulateV1 API');
      }
      throw err;
    }
  }

  public bumpGasLimit(gasLimit: bigint, _gasConfig?: L1TxUtilsConfig): bigint {
    const gasConfig = { ...this.config, ..._gasConfig };
    const bumpedGasLimit = gasLimit + (gasLimit * BigInt((gasConfig?.gasLimitBufferPercentage || 0) * 1_00)) / 100_00n;
    this.logger?.debug('Bumping gas limit', { gasLimit, gasConfig, bumpedGasLimit });
    return bumpedGasLimit;
  }
}

export class L1TxUtils extends ReadOnlyL1TxUtils {
  constructor(
    public override client: ExtendedViemWalletClient,
    protected override logger: Logger = createLogger('L1TxUtils'),
    config?: Partial<L1TxUtilsConfig>,
    debugMaxGasLimit: boolean = false,
  ) {
    super(client, logger, config, debugMaxGasLimit);
    if (!isExtendedClient(this.client)) {
      throw new Error('L1TxUtils has to be instantiated with a wallet client.');
    }
  }

  public getSenderAddress() {
    return this.client.account.address;
  }

  public getSenderBalance(): Promise<bigint> {
    return this.client.getBalance({
      address: this.getSenderAddress(),
    });
  }

  /**
   * Sends a transaction with gas estimation and pricing
   * @param request - The transaction request (to, data, value)
   * @param gasConfig - Optional gas configuration
   * @returns The transaction hash and parameters used
   */
  public async sendTransaction(
    request: L1TxRequest,
    _gasConfig?: L1GasConfig,
    blobInputs?: L1BlobInputs,
  ): Promise<{ txHash: Hex; gasLimit: bigint; gasPrice: GasPrice }> {
    try {
      const gasConfig = { ...this.config, ..._gasConfig };
      const account = this.client.account;
      let gasLimit: bigint;

      if (this.debugMaxGasLimit) {
        gasLimit = LARGE_GAS_LIMIT;
      } else if (gasConfig.gasLimit) {
        gasLimit = gasConfig.gasLimit;
      } else {
        gasLimit = await this.estimateGas(account, request, gasConfig);
      }

      this.logger?.debug('Gas limit', { gasLimit });

      const gasPrice = await this.getGasPrice(gasConfig, !!blobInputs);

      if (gasConfig.txTimeoutAt && Date.now() > gasConfig.txTimeoutAt.getTime()) {
        throw new Error('Transaction timed out before sending');
      }

      let txHash: Hex;
      if (blobInputs) {
        txHash = await this.client.sendTransaction({
          ...request,
          ...blobInputs,
          gas: gasLimit,
          maxFeePerGas: gasPrice.maxFeePerGas,
          maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
          maxFeePerBlobGas: gasPrice.maxFeePerBlobGas!,
        });
      } else {
        txHash = await this.client.sendTransaction({
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
      const viemError = formatViemError(err, request.abi);
      this.logger?.error(`Failed to send L1 transaction`, viemError.message, {
        metaMessages: viemError.metaMessages,
      });
      throw viemError;
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
    isCancelTx: boolean = false,
  ): Promise<TransactionReceipt> {
    const isBlobTx = !!_blobInputs;
    const gasConfig = { ...this.config, ..._gasConfig };
    const account = this.client.account;

    const blobInputs = _blobInputs || {};
    const makeGetTransactionBackoff = () =>
      makeBackoff(times(gasConfig.txPropagationMaxQueryAttempts ?? 3, i => i + 1));

    // Retry a few times, in case the tx is not yet propagated.
    const tx = await retry<GetTransactionReturnType>(
      () => this.client.getTransaction({ hash: initialTxHash }),
      `Getting L1 transaction ${initialTxHash}`,
      makeGetTransactionBackoff(),
      this.logger,
      true,
    );

    if (!tx) {
      throw new Error(`Failed to get L1 transaction ${initialTxHash} to monitor`);
    }

    if (tx?.nonce === undefined || tx?.nonce === null) {
      throw new Error(`Failed to get L1 transaction ${initialTxHash} nonce`);
    }
    const nonce = tx.nonce;

    const txHashes = new Set<Hex>([initialTxHash]);
    let currentTxHash = initialTxHash;
    let attempts = 0;
    let lastAttemptSent = Date.now();
    let lastGasPrice: GasPrice = {
      maxFeePerGas: tx.maxFeePerGas!,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas!,
      maxFeePerBlobGas: tx.maxFeePerBlobGas!,
    };
    const initialTxTime = lastAttemptSent;

    let txTimedOut = false;
    const isTimedOut = () =>
      (gasConfig.txTimeoutAt && Date.now() > gasConfig.txTimeoutAt.getTime()) ||
      (gasConfig.txTimeoutMs !== undefined && Date.now() - initialTxTime > gasConfig.txTimeoutMs) ||
      this.interrupted ||
      false;

    while (!txTimedOut) {
      try {
        const currentNonce = await this.client.getTransactionCount({ address: account.address });
        if (currentNonce > nonce) {
          for (const hash of txHashes) {
            try {
              const receipt = await this.client.getTransactionReceipt({ hash });
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
          () => this.client.getTransaction({ hash: currentTxHash }),
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
            isBlobTx,
            attempts,
            tx.maxFeePerGas && tx.maxPriorityFeePerGas
              ? {
                  maxFeePerGas: tx.maxFeePerGas,
                  maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
                  maxFeePerBlobGas: tx.maxFeePerBlobGas,
                }
              : undefined,
          );
          lastGasPrice = newGasPrice;

          this.logger?.debug(
            `L1 transaction ${currentTxHash} appears stuck. Attempting speed-up ${attempts}/${gasConfig.maxAttempts} ` +
              `with new priority fee ${formatGwei(newGasPrice.maxPriorityFeePerGas)} gwei`,
            {
              maxFeePerGas: formatGwei(newGasPrice.maxFeePerGas),
              maxPriorityFeePerGas: formatGwei(newGasPrice.maxPriorityFeePerGas),
              ...(newGasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(newGasPrice.maxFeePerBlobGas) }),
            },
          );

          currentTxHash = await this.client.sendTransaction({
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
        const viemError = formatViemError(err);
        this.logger?.warn(`Error monitoring L1 transaction ${currentTxHash}:`, viemError.message);
        if (viemError.message?.includes('reverted')) {
          throw viemError;
        }
        await sleep(gasConfig.checkIntervalMs!);
      }
      // Check if tx has timed out.
      txTimedOut = isTimedOut();
    }

    if (!isCancelTx) {
      // Fire cancellation without awaiting to avoid blocking the main thread
      this.attemptTxCancellation(nonce, isBlobTx, lastGasPrice, attempts)
        .then(cancelTxHash => {
          this.logger?.debug(`Sent cancellation tx ${cancelTxHash} for timed out tx ${currentTxHash}`);
        })
        .catch(err => {
          const viemError = formatViemError(err);
          this.logger?.error(`Failed to send cancellation for timed out tx ${currentTxHash}:`, viemError.message, {
            metaMessages: viemError.metaMessages,
          });
        });

      this.logger?.error(`L1 transaction ${currentTxHash} timed out`, {
        txHash: currentTxHash,
        ...tx,
      });
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
    gasConfig?: L1GasConfig,
    blobInputs?: L1BlobInputs,
  ): Promise<{ receipt: TransactionReceipt; gasPrice: GasPrice }> {
    const { txHash, gasLimit, gasPrice } = await this.sendTransaction(request, gasConfig, blobInputs);
    const receipt = await this.monitorTransaction(request, txHash, { gasLimit }, gasConfig, blobInputs);
    return { receipt, gasPrice };
  }

  public override async simulate(
    request: L1TxRequest & { gas?: bigint; from?: Hex },
    blockOverrides: BlockOverrides<bigint, number> = {},
    stateOverrides: StateOverride = [],
    abi: Abi = RollupAbi,
    _gasConfig?: L1TxUtilsConfig & { fallbackGasEstimate?: bigint },
  ): Promise<{ gasUsed: bigint; result: `0x${string}` }> {
    const gasConfig = { ...this.config, ..._gasConfig };
    const gasPrice = await this.getGasPrice(gasConfig, false);

    const call: any = {
      to: request.to!,
      data: request.data,
      from: request.from ?? this.client.account.address,
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      gas: request.gas ?? LARGE_GAS_LIMIT,
    };

    return this._simulate(call, blockOverrides, stateOverrides, gasConfig, abi);
  }

  /**
   * Attempts to cancel a transaction by sending a 0-value tx to self with same nonce but higher gas prices
   * @param nonce - The nonce of the transaction to cancel
   * @param previousGasPrice - The gas price of the previous transaction
   * @param attempts - The number of attempts to cancel the transaction
   * @returns The hash of the cancellation transaction
   */
  protected async attemptTxCancellation(nonce: number, isBlobTx = false, previousGasPrice?: GasPrice, attempts = 0) {
    if (isBlobTx) {
      throw new Error('Cannot cancel blob transactions, please use L1TxUtilsWithBlobsClass');
    }

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
  }
}

export function tryGetCustomErrorNameContractFunction(err: ContractFunctionExecutionError) {
  return compactArray([err.shortMessage, ...(err.metaMessages ?? []).slice(0, 2).map(s => s.trim())]).join(' ');
}

/*
 * Returns cost of calldata usage in Ethereum.
 * @param data - Calldata.
 * @returns 4 for each zero byte, 16 for each nonzero.
 */
export function getCalldataGasUsage(data: Uint8Array) {
  return data.filter(byte => byte === 0).length * 4 + data.filter(byte => byte !== 0).length * 16;
}
