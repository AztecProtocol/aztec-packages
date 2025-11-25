import { getKeys, median, merge, pick, times } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { DateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import pickBy from 'lodash.pickby';
import {
  type Abi,
  type Account,
  type BaseError,
  type BlockOverrides,
  type ContractFunctionExecutionError,
  type Hex,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  type StateOverride,
  decodeErrorResult,
  formatGwei,
  getContractError,
  hexToBytes,
} from 'viem';

import type { ViemClient } from '../types.js';
import { type L1TxUtilsConfig, defaultL1TxUtilsConfig, l1TxUtilsConfigMappings } from './config.js';
import {
  BLOCK_TIME_MS,
  LARGE_GAS_LIMIT,
  MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE,
  MIN_REPLACEMENT_BUMP_PERCENTAGE,
  WEI_CONST,
} from './constants.js';
import type { GasPrice, L1BlobInputs, L1TxRequest, TransactionStats } from './types.js';
import { getCalldataGasUsage, tryGetCustomErrorNameContractFunction } from './utils.js';

const HISTORICAL_BLOCK_COUNT = 5;

export class ReadOnlyL1TxUtils {
  public config: Required<L1TxUtilsConfig>;
  protected interrupted = false;

  constructor(
    public client: ViemClient,
    protected logger: Logger = createLogger('ethereum:readonly-l1-utils'),
    public readonly dateProvider: DateProvider,
    config?: Partial<L1TxUtilsConfig>,
    protected debugMaxGasLimit: boolean = false,
  ) {
    this.config = merge(defaultL1TxUtilsConfig, pick(config || {}, ...getKeys(l1TxUtilsConfigMappings)));
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
   * Analyzes pending transactions and recent fee history to determine a competitive priority fee.
   * Falls back to network estimate if data is unavailable or fails.
   * @param networkEstimateResult - Result from estimateMaxPriorityFeePerGas RPC call
   * @param pendingBlockResult - Result from getBlock with pending tag RPC call
   * @param feeHistoryResult - Result from getFeeHistory RPC call
   * @returns A competitive priority fee based on pending txs and recent block history
   */
  protected getCompetitivePriorityFee(
    networkEstimateResult: PromiseSettledResult<bigint | null>,
    pendingBlockResult: PromiseSettledResult<Awaited<ReturnType<ViemClient['getBlock']>> | null>,
    feeHistoryResult: PromiseSettledResult<Awaited<ReturnType<ViemClient['getFeeHistory']>> | null>,
  ): bigint {
    const networkEstimate =
      networkEstimateResult.status === 'fulfilled' && typeof networkEstimateResult.value === 'bigint'
        ? networkEstimateResult.value
        : 0n;
    let competitiveFee = networkEstimate;

    if (
      pendingBlockResult.status === 'fulfilled' &&
      pendingBlockResult.value !== null &&
      pendingBlockResult.value.transactions &&
      pendingBlockResult.value.transactions.length > 0
    ) {
      const pendingBlock = pendingBlockResult.value;
      // Extract priority fees from pending transactions
      const pendingFees = pendingBlock.transactions
        .map(tx => {
          // Transaction can be just a hash string, so we need to check if it's an object
          if (typeof tx === 'string') {
            return 0n;
          }
          const fee = tx.maxPriorityFeePerGas || 0n;
          // Debug: Log suspicious fees
          if (fee > 100n * WEI_CONST) {
            this.logger?.warn('Suspicious high priority fee in pending tx', {
              txHash: tx.hash,
              maxPriorityFeePerGas: formatGwei(fee),
              maxFeePerGas: formatGwei(tx.maxFeePerGas || 0n),
              maxFeePerBlobGas: tx.maxFeePerBlobGas ? formatGwei(tx.maxFeePerBlobGas) : 'N/A',
            });
          }
          return fee;
        })
        .filter((fee: bigint) => fee > 0n);

      if (pendingFees.length > 0) {
        // Use 75th percentile of pending fees to be competitive
        const sortedPendingFees = [...pendingFees].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        const percentile75Index = Math.floor((sortedPendingFees.length - 1) * 0.75);
        const pendingCompetitiveFee = sortedPendingFees[percentile75Index];

        if (pendingCompetitiveFee > competitiveFee) {
          competitiveFee = pendingCompetitiveFee;
        }

        this.logger?.debug('Analyzed pending transactions for competitive pricing', {
          pendingTxCount: pendingFees.length,
          pendingP75: formatGwei(pendingCompetitiveFee),
        });
      }
    }
    if (
      feeHistoryResult.status === 'fulfilled' &&
      feeHistoryResult.value !== null &&
      feeHistoryResult.value.reward &&
      feeHistoryResult.value.reward.length > 0
    ) {
      const feeHistory = feeHistoryResult.value;
      // Extract 75th percentile fees from each block
      const percentile75Fees = feeHistory.reward!.map(rewards => rewards[0] || 0n).filter(fee => fee > 0n);

      if (percentile75Fees.length > 0) {
        // Calculate median of the 75th percentile fees across blocks
        const medianHistoricalFee = median(percentile75Fees) ?? 0n;

        // Debug: Log suspicious fees from history
        if (medianHistoricalFee > 100n * WEI_CONST) {
          this.logger?.warn('Suspicious high fee in history', {
            historicalMedian: formatGwei(medianHistoricalFee),
            allP75Fees: percentile75Fees.map(f => formatGwei(f)),
          });
        }

        if (medianHistoricalFee > competitiveFee) {
          competitiveFee = medianHistoricalFee;
        }

        this.logger?.debug('Analyzed fee history for competitive pricing', {
          historicalMedian: formatGwei(medianHistoricalFee),
        });
      }
    }

    // Sanity check: cap competitive fee at 100x network estimate to avoid using unrealistic fees
    // (e.g., Anvil returns inflated historical fees that don't reflect actual network conditions)
    const maxReasonableFee = networkEstimate * 100n;
    if (competitiveFee > maxReasonableFee) {
      this.logger?.warn('Competitive fee exceeds sanity cap, using capped value', {
        competitiveFee: formatGwei(competitiveFee),
        networkEstimate: formatGwei(networkEstimate),
        cappedTo: formatGwei(maxReasonableFee),
      });
      competitiveFee = maxReasonableFee;
    }

    // Log final decision
    if (competitiveFee > networkEstimate) {
      this.logger?.debug('Using competitive fee from market analysis', {
        networkEstimate: formatGwei(networkEstimate),
        competitive: formatGwei(competitiveFee),
      });
    }

    return competitiveFee;
  }

  /**
   * Gets the current gas price with bounds checking
   */
  public async getGasPrice(
    gasConfigOverrides?: L1TxUtilsConfig,
    isBlobTx: boolean = false,
    attempt: number = 0,
    previousGasPrice?: typeof attempt extends 0 ? never : GasPrice,
  ): Promise<GasPrice> {
    const gasConfig = merge(this.config, gasConfigOverrides);

    // Make all RPC calls in parallel upfront with retry logic
    const latestBlockPromise = this.tryTwice(
      () => this.client.getBlock({ blockTag: 'latest' }),
      'Getting latest block',
    );
    const networkEstimatePromise = gasConfig.fixedPriorityFeePerGas
      ? null
      : this.tryTwice(() => this.client.estimateMaxPriorityFeePerGas(), 'Estimating max priority fee per gas');
    const pendingBlockPromise = gasConfig.fixedPriorityFeePerGas
      ? null
      : this.tryTwice(
          () => this.client.getBlock({ blockTag: 'pending', includeTransactions: true }),
          'Getting pending block',
        );
    const feeHistoryPromise = gasConfig.fixedPriorityFeePerGas
      ? null
      : this.tryTwice(
          () => this.client.getFeeHistory({ blockCount: HISTORICAL_BLOCK_COUNT, rewardPercentiles: [75] }),
          'Getting fee history',
        );
    const blobBaseFeePromise = isBlobTx
      ? this.tryTwice(() => this.client.getBlobBaseFee(), 'Getting blob base fee')
      : null;

    const [latestBlockResult, networkEstimateResult, pendingBlockResult, feeHistoryResult, blobBaseFeeResult] =
      await Promise.allSettled([
        latestBlockPromise,
        networkEstimatePromise ?? Promise.resolve(0n),
        pendingBlockPromise ?? Promise.resolve(null),
        feeHistoryPromise ?? Promise.resolve(null),
        blobBaseFeePromise ?? Promise.resolve(0n),
      ]);

    // Extract results
    const baseFee =
      latestBlockResult.status === 'fulfilled' &&
      typeof latestBlockResult.value === 'object' &&
      latestBlockResult.value.baseFeePerGas
        ? latestBlockResult.value.baseFeePerGas
        : 0n;

    // Get blob base fee if available
    let blobBaseFee = 0n;
    if (isBlobTx && blobBaseFeeResult.status === 'fulfilled' && typeof blobBaseFeeResult.value === 'bigint') {
      blobBaseFee = blobBaseFeeResult.value;
    } else if (isBlobTx) {
      this.logger?.warn('Failed to get L1 blob base fee', attempt);
    }

    let priorityFee: bigint;
    if (gasConfig.fixedPriorityFeePerGas) {
      this.logger?.debug('Using fixed priority fee per L1 gas', {
        fixedPriorityFeePerGas: gasConfig.fixedPriorityFeePerGas,
      });
      priorityFee = BigInt(Math.trunc(gasConfig.fixedPriorityFeePerGas * Number(WEI_CONST)));
    } else {
      // Get competitive priority fee (includes network estimate + analysis)
      priorityFee = this.getCompetitivePriorityFee(networkEstimateResult, pendingBlockResult, feeHistoryResult);
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

      let competitivePriorityFee = priorityFee;
      if (!gasConfig.fixedPriorityFeePerGas) {
        // Apply bump percentage to competitive fee
        competitivePriorityFee = (priorityFee * (100_00n + BigInt(configBump * 1_00))) / 100_00n;

        this.logger?.debug(`Speed-up attempt ${attempt}: using competitive fee strategy`, {
          networkEstimate: formatGwei(priorityFee),
          competitiveFee: formatGwei(competitivePriorityFee),
          minRequired: formatGwei(minPriorityFee),
          bumpPercentage: configBump,
        });
      }

      // Use maximum between competitive fee and minimum required bump
      const finalPriorityFee = competitivePriorityFee > minPriorityFee ? competitivePriorityFee : minPriorityFee;
      const feeSource = finalPriorityFee === competitivePriorityFee ? 'competitive' : 'minimum-bump';

      priorityFee = finalPriorityFee;
      // Add the final priority fee to maxFeePerGas
      maxFeePerGas += finalPriorityFee;
      maxFeePerGas = maxFeePerGas > minMaxFee ? maxFeePerGas : minMaxFee;

      if (!gasConfig.fixedPriorityFeePerGas) {
        this.logger?.debug(`Speed-up fee decision: using ${feeSource} fee`, {
          finalPriorityFee: formatGwei(finalPriorityFee),
        });
      }
    } else {
      // First attempt: apply configured bump percentage to competitive fee
      // multiply by 100 & divide by 100 to maintain some precision
      if (!gasConfig.fixedPriorityFeePerGas) {
        priorityFee = (priorityFee * (100_00n + BigInt((gasConfig.priorityFeeBumpPercentage || 0) * 1_00))) / 100_00n;
        this.logger?.debug('Initial transaction: using competitive fee from market analysis', {
          networkEstimate: formatGwei(priorityFee),
        });
      }
      maxFeePerGas += priorityFee;
    }

    // maxGwei and maxBlobGwei are hard limits
    const effectiveMaxGwei = BigInt(Math.trunc(gasConfig.maxGwei! * Number(WEI_CONST)));
    const effectiveMaxBlobGwei = BigInt(Math.trunc(gasConfig.maxBlobGwei! * Number(WEI_CONST)));

    // Ensure we don't exceed maxGwei
    if (effectiveMaxGwei > 0n) {
      maxFeePerGas = maxFeePerGas > effectiveMaxGwei ? effectiveMaxGwei : maxFeePerGas;
    }

    // Ensure we don't exceed maxBlobGwei
    if (maxFeePerBlobGas && effectiveMaxBlobGwei > 0n) {
      maxFeePerBlobGas = maxFeePerBlobGas > effectiveMaxBlobGwei ? effectiveMaxBlobGwei : maxFeePerBlobGas;
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

    this.logger?.trace(
      `Computed L1 gas price max fee ${formatGwei(maxFeePerGas)} and max priority fee ${formatGwei(maxPriorityFeePerGas)}`,
      {
        attempt,
        baseFee: formatGwei(baseFee),
        maxFeePerGas: formatGwei(maxFeePerGas),
        maxPriorityFeePerGas: formatGwei(maxPriorityFeePerGas),
        blobBaseFee: formatGwei(blobBaseFee),
        maxFeePerBlobGas: formatGwei(maxFeePerBlobGas),
      },
    );

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

      this.logger?.trace(`Estimated gas for blob tx: ${initialEstimate}`);
    } else {
      initialEstimate = await this.client.estimateGas({ account, ...request, gas: LARGE_GAS_LIMIT });
      this.logger?.trace(`Estimated gas for non-blob tx: ${initialEstimate}`);
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
        validation: false,
        blocks: [
          {
            blockOverrides,
            stateOverrides,
            calls: [call],
          },
        ],
      });

      if (result[0].calls[0].status === 'failure') {
        this.logger?.error('L1 transaction simulation failed', result[0].calls[0].error);
        const decodedError = decodeErrorResult({ abi, data: result[0].calls[0].data });

        throw new Error(
          `L1 transaction simulation failed with error ${decodedError.errorName}(${decodedError.args?.join(',')})`,
        );
      }
      this.logger?.debug(`L1 transaction simulation succeeded`, { ...result[0].calls[0] });
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

    const cleanGasConfig = pickBy(gasConfig, (_, key) => key in l1TxUtilsConfigMappings);
    this.logger?.trace(`Bumping gas limit from ${gasLimit} to ${bumpedGasLimit}`, {
      gasLimit,
      gasConfig: cleanGasConfig,
      bumpedGasLimit,
    });
    return bumpedGasLimit;
  }

  /**
   * Helper function to retry RPC calls twice
   */
  private tryTwice<T>(fn: () => Promise<T>, description: string): Promise<T> {
    return retry<T>(fn, description, makeBackoff(times(2, () => 0)), this.logger, true);
  }
}
