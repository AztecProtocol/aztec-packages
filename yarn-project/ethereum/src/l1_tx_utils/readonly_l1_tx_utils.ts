import { getKeys, merge, pick, times } from '@aztec/foundation/collection';
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
   * Gets the current gas price with bounds checking
   */
  public async getGasPrice(
    gasConfigOverrides?: L1TxUtilsConfig,
    isBlobTx: boolean = false,
    attempt: number = 0,
    previousGasPrice?: typeof attempt extends 0 ? never : GasPrice,
  ): Promise<GasPrice> {
    const gasConfig = merge(this.config, gasConfigOverrides);
    const block = await this.client.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas ?? 0n;

    // Get blob base fee if available
    let blobBaseFee = 0n;
    if (isBlobTx) {
      try {
        blobBaseFee = await retry<bigint>(
          () => this.client.getBlobBaseFee(),
          'Getting L1 blob base fee',
          makeBackoff(times(2, () => 1)),
          this.logger,
          true,
        );
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
}
