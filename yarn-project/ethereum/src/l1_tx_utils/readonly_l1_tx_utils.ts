import { getKeys, merge, pick, times } from '@aztec/foundation/collection';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { DateProvider } from '@aztec/foundation/timer';
import { getErrorCause } from '@aztec/foundation/types';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import pickBy from 'lodash.pickby';
import {
  type Abi,
  type Account,
  type BaseError,
  type BlockOverrides,
  type ContractFunctionExecutionError,
  type GetCodeReturnType,
  type Hex,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  RpcRequestError,
  type StateOverride,
  decodeErrorResult,
  formatGwei,
  getContractError,
  hexToBytes,
} from 'viem';

import { getL1RpcErrorCode } from '../client.js';
import type { ViemClient } from '../types.js';
import { type L1TxUtilsConfig, defaultL1TxUtilsConfig, l1TxUtilsConfigMappings } from './config.js';
import {
  BLOCK_TIME_MS,
  MAX_L1_TX_LIMIT,
  MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE,
  MIN_REPLACEMENT_BUMP_PERCENTAGE,
  WEI_CONST,
} from './constants.js';
import { P75AllTxsPriorityFeeStrategy, type PriorityFeeStrategy } from './fee-strategies/index.js';
import type { FeesPerGas, L1BlobInputs, L1TxRequest, TransactionStats } from './types.js';
import { getCalldataGasUsage, tryGetCustomErrorNameContractFunction } from './utils.js';

// Change this to the current strategy we want to use
const CurrentStrategy: PriorityFeeStrategy = P75AllTxsPriorityFeeStrategy;

/** Error code returned by eth_simulateV1 for `insufficient funds for gas * price + value`. */
const INSUFFICIENT_FUNDS_RPC_ERROR_CODE = -38014;

/**
 * Returns true when an RPC transport error reports the node's upfront funds check
 * (sender balance >= gasLimit * maxFeePerGas) rejecting the request. Matches on the message as well as on the
 * error code, since RPC gateways differ in how they wrap node errors. Apply this only to transport errors: an
 * execution revert string can mention insufficient funds without being this kind of rejection.
 */
function isInsufficientFundsRpcError(err: unknown): boolean {
  if (getL1RpcErrorCode(err) === INSUFFICIENT_FUNDS_RPC_ERROR_CODE) {
    return true;
  }
  const messages = [err, getErrorCause(err, RpcRequestError)].map(e => (e instanceof Error ? e.message : '')).join(' ');
  return /insufficient funds/i.test(messages);
}

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

  public getCode(address: EthAddress): Promise<GetCodeReturnType> {
    return this.client.getCode({ address: address.toString() });
  }

  /**
   * Gets the EIP-1559 fees per gas to send with, derived from the current network fees and bounded by the config
   */
  public async getFeesPerGas(
    gasConfigOverrides?: L1TxUtilsConfig,
    isBlobTx: boolean = false,
    attempt: number = 0,
    previousFeesPerGas?: typeof attempt extends 0 ? never : FeesPerGas,
  ): Promise<FeesPerGas> {
    const gasConfig = merge(this.config, gasConfigOverrides);

    // Execute strategy - it handles all RPC calls internally and returns everything we need
    const strategyResult = await retry(
      () =>
        CurrentStrategy.execute(this.client, {
          gasConfig,
          isBlobTx,
          logger: this.logger,
        }),
      'Executing priority fee strategy',
      makeBackoff(times(2, () => 0)),
      this.logger,
      true,
    );

    const { latestBlock, blobBaseFee, priorityFee: strategyPriorityFee } = strategyResult;

    // Extract base fee from latest block
    const baseFee = latestBlock.baseFeePerGas ?? 0n;

    // Handle blob base fee
    if (isBlobTx && blobBaseFee === undefined) {
      this.logger?.warn('Failed to get L1 blob base fee', attempt);
    }

    let priorityFee = strategyPriorityFee;

    // Apply minimum priority fee floor if configured
    if (gasConfig.minimumPriorityFeePerGas) {
      const minimumPriorityFee = BigInt(Math.trunc(gasConfig.minimumPriorityFeePerGas * Number(WEI_CONST)));
      if (priorityFee < minimumPriorityFee) {
        this.logger?.debug('Applying minimum priority fee floor', {
          calculatedPriorityFee: formatGwei(priorityFee),
          minimumPriorityFeePerGas: gasConfig.minimumPriorityFeePerGas,
          appliedFee: formatGwei(minimumPriorityFee),
        });
        priorityFee = minimumPriorityFee;
      }
    }
    let maxFeePerGas = baseFee;

    let maxFeePerBlobGas = blobBaseFee ?? 0n;

    // Bump base fee so it's valid for next blocks if it stalls
    const numBlocks = Math.ceil(gasConfig.stallTimeMs! / BLOCK_TIME_MS);
    for (let i = 0; i < numBlocks; i++) {
      // each block can go up 12.5% from previous baseFee
      // ceil, (a+b-1)/b, to avoid truncation at small values (e.g. 1 wei blob base fee)
      maxFeePerGas = (maxFeePerGas * (1_000n + 125n) + 999n) / 1_000n;
      // same for blob gas fee
      maxFeePerBlobGas = (maxFeePerBlobGas * (1_000n + 125n) + 999n) / 1_000n;
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
        (previousFeesPerGas!.maxPriorityFeePerGas * (100_00n + BigInt(bumpPercentage * 1_00))) / 100_00n;
      const minMaxFee = (previousFeesPerGas!.maxFeePerGas * (100_00n + BigInt(bumpPercentage * 1_00))) / 100_00n;

      // Apply bump percentage to competitive fee
      const competitivePriorityFee = (priorityFee * (100_00n + BigInt(configBump * 1_00))) / 100_00n;

      this.logger?.debug(`Speed-up attempt ${attempt}: using competitive fee strategy`, {
        networkEstimate: formatGwei(priorityFee),
        competitiveFee: formatGwei(competitivePriorityFee),
        minRequired: formatGwei(minPriorityFee),
        bumpPercentage: configBump,
      });

      // Use maximum between competitive fee and minimum required bump
      const finalPriorityFee = competitivePriorityFee > minPriorityFee ? competitivePriorityFee : minPriorityFee;
      const feeSource = finalPriorityFee === competitivePriorityFee ? 'competitive' : 'minimum-bump';

      priorityFee = finalPriorityFee;
      // Add the final priority fee to maxFeePerGas
      maxFeePerGas += finalPriorityFee;
      maxFeePerGas = maxFeePerGas > minMaxFee ? maxFeePerGas : minMaxFee;

      this.logger?.debug(`Speed-up fee decision: using ${feeSource} fee`, {
        finalPriorityFee: formatGwei(finalPriorityFee),
      });
    } else {
      // First attempt: apply configured bump percentage to competitive fee
      // multiply by 100 & divide by 100 to maintain some precision
      priorityFee = (priorityFee * (100_00n + BigInt((gasConfig.priorityFeeBumpPercentage || 0) * 1_00))) / 100_00n;
      this.logger?.debug('Initial transaction: using competitive fee from market analysis', {
        networkEstimate: formatGwei(priorityFee),
      });
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

    if (attempt > 0 && previousFeesPerGas?.maxFeePerBlobGas) {
      const bumpPercentage =
        gasConfig.priorityFeeRetryBumpPercentage! > MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE
          ? gasConfig.priorityFeeRetryBumpPercentage!
          : MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE;

      // calculate min blob fee based on previous attempt
      const minBlobFee = (previousFeesPerGas.maxFeePerBlobGas * (100_00n + BigInt(bumpPercentage * 1_00))) / 100_00n;

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
        blobBaseFee: formatGwei(blobBaseFee ?? 0n),
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
      // @note requests with blobs also require maxFeePerBlobGas to be set.
      // Use 2x buffer for maxFeePerBlobGas to avoid stale fees and to pass EIP-4844 validation (even if it is a gas estimation call).
      // 1. maxFeePerBlobGas >= blobBaseFee
      // 2. account balance >= gas * maxFeePerGas + maxFeePerBlobGas * blobCount + value
      const feesPerGas = await this.getFeesPerGas(gasConfig, true, 0);
      initialEstimate = await this.client.estimateGas({
        account,
        ...request,
        ..._blobInputs,
        maxFeePerBlobGas: feesPerGas.maxFeePerBlobGas! * 2n,
        gas: MAX_L1_TX_LIMIT,
        blockTag: 'latest',
      });

      this.logger?.trace(`Estimated gas for blob tx: ${initialEstimate}`);
    } else {
      initialEstimate = await this.client.estimateGas({
        account,
        ...request,
        gas: MAX_L1_TX_LIMIT,
        blockTag: 'latest',
      });
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
    const simulateBlocks = () =>
      this.client.simulateBlocks({
        validation: false,
        blocks: [
          {
            blockOverrides,
            stateOverrides,
            calls: [call],
          },
        ],
      });

    // Only the request itself is wrapped, so that transport-level rejections are never confused with an
    // execution revert (whose decoded revert string could well mention insufficient funds too).
    let result: Awaited<ReturnType<typeof simulateBlocks>>;
    try {
      result = await simulateBlocks();
    } catch (err) {
      if (getErrorCause(err, MethodNotFoundRpcError) || getErrorCause(err, MethodNotSupportedRpcError)) {
        if (gasConfig.fallbackGasEstimate) {
          this.logger?.warn(
            `Node does not support eth_simulateV1 API. Using fallback gas estimate: ${gasConfig.fallbackGasEstimate}`,
          );
          return { gasUsed: gasConfig.fallbackGasEstimate, result: '0x' as `0x${string}` };
        }
        this.logger?.error('Node does not support eth_simulateV1 API');
      }
      if (isInsufficientFundsRpcError(err)) {
        const rpcError = getErrorCause(err, RpcRequestError);
        const providerMessage = rpcError?.details ?? (err instanceof Error ? err.message : String(err));
        const gas = call?.gas !== undefined ? `, gas ${call.gas}` : '';
        throw new Error(
          `L1 node rejected the eth_simulateV1 request with an insufficient funds error before executing it ` +
            `(sender ${call?.from ?? 'unknown'}${gas}): ${providerMessage}`,
          { cause: err },
        );
      }
      throw err;
    }

    if (result[0].calls[0].status === 'failure') {
      this.logger?.error('L1 transaction simulation failed', result[0].calls[0].error);
      const decodedError = decodeErrorResult({ abi, data: result[0].calls[0].data });

      throw new Error(
        `L1 transaction simulation failed with error ${decodedError.errorName}(${decodedError.args?.join(',')})`,
      );
    }
    this.logger?.debug(`L1 transaction simulation succeeded`, { ...result[0].calls[0] });
    return { gasUsed: result[0].gasUsed, result: result[0].calls[0].data as `0x${string}` };
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
