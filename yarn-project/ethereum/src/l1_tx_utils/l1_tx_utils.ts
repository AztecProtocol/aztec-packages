import { maxBigint } from '@aztec/foundation/bigint';
import { times } from '@aztec/foundation/collection';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import pickBy from 'lodash.pickby';
import {
  type Abi,
  type BlockOverrides,
  type GetTransactionReturnType,
  type Hex,
  type NonceManager,
  type PrepareTransactionRequestRequest,
  type StateOverride,
  type TransactionReceipt,
  type TransactionSerializable,
  createNonceManager,
  formatGwei,
  serializeTransaction,
} from 'viem';
import { jsonRpc } from 'viem/nonce';

import type { ViemClient } from '../types.js';
import { formatViemError } from '../utils.js';
import { type L1TxUtilsConfig, l1TxUtilsConfigMappings } from './config.js';
import { LARGE_GAS_LIMIT } from './constants.js';
import { ReadOnlyL1TxUtils } from './readonly_l1_tx_utils.js';
import {
  type L1BlobInputs,
  type L1GasConfig,
  type L1TxRequest,
  type L1TxState,
  type SigningCallback,
  TxUtilsState,
} from './types.js';

const MAX_L1_TX_STATES = 32;

export class L1TxUtils extends ReadOnlyL1TxUtils {
  protected nonceManager: NonceManager;
  protected txs: L1TxState[] = [];

  constructor(
    public override client: ViemClient,
    public address: EthAddress,
    protected signer: SigningCallback,
    protected override logger: Logger = createLogger('L1TxUtils'),
    dateProvider: DateProvider = new DateProvider(),
    config?: Partial<L1TxUtilsConfig>,
    debugMaxGasLimit: boolean = false,
  ) {
    super(client, logger, dateProvider, config, debugMaxGasLimit);
    this.nonceManager = createNonceManager({ source: jsonRpc() });
  }

  public get state() {
    return this.txs.at(-1)?.status ?? TxUtilsState.IDLE;
  }

  public get lastMinedAtBlockNumber() {
    const minedBlockNumbers = this.txs.map(tx => tx.receipt?.blockNumber).filter(bn => bn !== undefined);
    return minedBlockNumbers.length === 0 ? undefined : maxBigint(...minedBlockNumbers);
  }

  protected updateState(l1TxState: L1TxState, newState: TxUtilsState) {
    const oldState = l1TxState.status;
    l1TxState.status = newState;
    const sender = this.getSenderAddress().toString();
    this.logger.debug(
      `State changed from ${TxUtilsState[oldState]} to ${TxUtilsState[newState]} for nonce ${l1TxState.nonce} account ${sender}`,
    );
  }

  public updateConfig(newConfig: Partial<L1TxUtilsConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.logger.info(
      'Updated L1TxUtils config',
      pickBy(newConfig, (_, key) => key in l1TxUtilsConfigMappings),
    );
  }

  public getSenderAddress() {
    return this.address;
  }

  public getSenderBalance(): Promise<bigint> {
    return this.client.getBalance({
      address: this.getSenderAddress().toString(),
    });
  }

  private async signTransaction(txRequest: TransactionSerializable): Promise<`0x${string}`> {
    const signature = await this.signer(txRequest, this.getSenderAddress());
    return serializeTransaction(txRequest, signature);
  }

  protected async prepareSignedTransaction(txData: PrepareTransactionRequestRequest) {
    const txRequest = await this.client.prepareTransactionRequest(txData);
    return await this.signTransaction(txRequest as TransactionSerializable);
  }

  /**
   * Sends a transaction with gas estimation and pricing
   * @param request - The transaction request (to, data, value)
   * @param gasConfig - Optional gas configuration
   * @returns The transaction hash and parameters used
   */
  public async sendTransaction(
    request: L1TxRequest,
    gasConfigOverrides?: L1GasConfig,
    blobInputs?: L1BlobInputs,
    stateChange: TxUtilsState = TxUtilsState.SENT,
  ): Promise<{ txHash: Hex; state: L1TxState }> {
    try {
      const gasConfig = { ...this.config, ...gasConfigOverrides };
      const account = this.getSenderAddress().toString();

      let gasLimit: bigint;
      if (this.debugMaxGasLimit) {
        gasLimit = LARGE_GAS_LIMIT;
      } else if (gasConfig.gasLimit) {
        gasLimit = gasConfig.gasLimit;
      } else {
        gasLimit = await this.estimateGas(account, request, gasConfig);
      }
      this.logger?.debug(`Gas limit for request is ${gasLimit}`, { gasLimit, ...request });

      const gasPrice = await this.getGasPrice(gasConfig, !!blobInputs);

      if (gasConfig.txTimeoutAt && this.dateProvider.now() > gasConfig.txTimeoutAt.getTime()) {
        throw new Error('Transaction timed out before sending');
      }

      const nonce = await this.nonceManager.consume({
        client: this.client,
        address: account,
        chainId: this.client.chain.id,
      });

      const l1TxState: L1TxState = {
        txHashes: [],
        cancelTxHashes: [],
        gasPrice,
        request,
        status: TxUtilsState.IDLE,
        nonce,
        gasLimit,
        txConfig: gasConfig,
        blobInputs,
      };

      this.updateState(l1TxState, stateChange);

      const baseTxData = {
        ...request,
        gas: gasLimit,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
        nonce,
      };

      const txData = blobInputs
        ? { ...baseTxData, ...blobInputs, maxFeePerBlobGas: gasPrice.maxFeePerBlobGas! }
        : baseTxData;

      const signedRequest = await this.prepareSignedTransaction(txData);
      const txHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

      l1TxState.txHashes.push(txHash);
      this.txs.push(l1TxState);
      if (this.txs.length > MAX_L1_TX_STATES) {
        this.txs.shift();
      }

      const cleanGasConfig = pickBy(gasConfig, (_, key) => key in l1TxUtilsConfigMappings);
      this.logger?.info(`Sent L1 transaction ${txHash}`, {
        gasLimit,
        maxFeePerGas: formatGwei(gasPrice.maxFeePerGas),
        maxPriorityFeePerGas: formatGwei(gasPrice.maxPriorityFeePerGas),
        gasConfig: cleanGasConfig,
        ...(gasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(gasPrice.maxFeePerBlobGas) }),
      });

      return { txHash, state: l1TxState };
    } catch (err: any) {
      const viemError = formatViemError(err, request.abi);
      this.logger?.error(`Failed to send L1 transaction`, viemError.message, {
        metaMessages: viemError.metaMessages,
      });
      throw viemError;
    }
  }

  private async tryGetTxReceipt(
    txHashes: Hex[],
    nonce: number,
    isCancelTx: boolean,
  ): Promise<TransactionReceipt | undefined> {
    for (const hash of txHashes) {
      try {
        const receipt = await this.client.getTransactionReceipt({ hash });
        if (receipt) {
          const what = isCancelTx ? 'Cancellation L1 transaction' : 'L1 transaction';
          if (receipt.status === 'reverted') {
            this.logger?.warn(`${what} ${hash} with nonce ${nonce} reverted`, receipt);
          } else {
            this.logger?.verbose(`${what} ${hash} with nonce ${nonce} mined`, receipt);
          }
          return receipt;
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'TransactionReceiptNotFoundError') {
          continue;
        } else {
          this.logger.error(`Error getting receipt for tx ${hash}`, err);
          continue;
        }
      }
    }
  }

  /**
   * Monitors a transaction until completion, handling speed-ups if needed
   */
  protected async monitorTransaction(state: L1TxState): Promise<TransactionReceipt> {
    const { request, nonce, txHashes, cancelTxHashes, gasLimit, blobInputs, txConfig: gasConfig } = state;
    const isCancelTx = cancelTxHashes.length > 0;
    const isBlobTx = !!blobInputs;
    const account = this.getSenderAddress().toString();

    const makeGetTransactionBackoff = () =>
      makeBackoff(times(gasConfig.txPropagationMaxQueryAttempts ?? 3, i => i + 1));

    let currentTxHash = isCancelTx ? cancelTxHashes[0] : txHashes[0];
    let attempts = 0;
    let lastAttemptSent = this.dateProvider.now();

    const initialTxTime = lastAttemptSent;
    let txTimedOut = false;
    let latestBlockTimestamp: bigint | undefined;

    // We check against the latestBlockTimestamp as opposed to the current time to avoid a race condition where
    // the tx is mined in a block with the same timestamp as txTimeoutAt, but our execution node has not yet processed it,
    // or the loop here has not yet checked the tx before that timeout.
    const isTimedOut = () =>
      (gasConfig.txTimeoutAt &&
        latestBlockTimestamp !== undefined &&
        Number(latestBlockTimestamp) * 1000 >= gasConfig.txTimeoutAt.getTime()) ||
      (gasConfig.txTimeoutMs !== undefined && this.dateProvider.now() - initialTxTime > gasConfig.txTimeoutMs) ||
      this.interrupted ||
      false;

    while (!txTimedOut) {
      try {
        ({ timestamp: latestBlockTimestamp } = await this.client.getBlock({
          blockTag: 'latest',
          includeTransactions: false,
        }));

        const currentNonce = await this.client.getTransactionCount({ address: account });
        // If the current nonce on our account is greater than our transaction's nonce then a tx with the same nonce has been mined.
        if (currentNonce > nonce) {
          const receipt =
            (await this.tryGetTxReceipt(cancelTxHashes, nonce, true)) ??
            (await this.tryGetTxReceipt(txHashes, nonce, false));

          if (receipt) {
            this.updateState(state, TxUtilsState.MINED);
            state.receipt = receipt;
            return receipt;
          }

          // If we get here then we have checked all of our tx versions and not found anything.
          // We should consider the nonce as MINED
          this.updateState(state, TxUtilsState.MINED);
          throw new Error(`Nonce ${nonce} is MINED but not by one of our expected transactions`);
        }

        this.logger?.trace(`Tx timeout check for ${currentTxHash}: ${isTimedOut()}`, {
          latestBlockTimestamp: Number(latestBlockTimestamp) * 1000,
          lastAttemptSent,
          initialTxTime,
          now: this.dateProvider.now(),
          txTimeoutAt: gasConfig.txTimeoutAt?.getTime(),
          txTimeoutMs: gasConfig.txTimeoutMs,
          txStallTime: gasConfig.stallTimeMs,
        });

        // Retry a few times, in case the tx is not yet propagated.
        const tx = await retry<GetTransactionReturnType>(
          () => this.client.getTransaction({ hash: currentTxHash }),
          `Getting L1 transaction ${currentTxHash}`,
          makeGetTransactionBackoff(),
          this.logger,
          true,
        );
        const timePassed = this.dateProvider.now() - lastAttemptSent;

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
          state.gasPrice = newGasPrice;

          this.logger?.debug(
            `L1 transaction ${currentTxHash} appears stuck. Attempting speed-up ${attempts}/${gasConfig.maxAttempts} ` +
              `with new priority fee ${formatGwei(newGasPrice.maxPriorityFeePerGas)} gwei`,
            {
              maxFeePerGas: formatGwei(newGasPrice.maxFeePerGas),
              maxPriorityFeePerGas: formatGwei(newGasPrice.maxPriorityFeePerGas),
              ...(newGasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(newGasPrice.maxFeePerBlobGas) }),
            },
          );

          const baseTxData = {
            ...request,
            gas: gasLimit,
            maxFeePerGas: newGasPrice.maxFeePerGas,
            maxPriorityFeePerGas: newGasPrice.maxPriorityFeePerGas,
            nonce,
          };

          const txData = blobInputs
            ? { ...baseTxData, ...blobInputs, maxFeePerBlobGas: newGasPrice.maxFeePerBlobGas! }
            : baseTxData;

          const signedRequest = await this.prepareSignedTransaction(txData);
          const newHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

          if (!isCancelTx) {
            this.updateState(state, TxUtilsState.SPEED_UP);
          }

          const cleanGasConfig = pickBy(gasConfig, (_, key) => key in l1TxUtilsConfigMappings);
          this.logger?.verbose(`Sent L1 speed-up tx ${newHash}, replacing ${currentTxHash}`, {
            gasLimit,
            maxFeePerGas: formatGwei(newGasPrice.maxFeePerGas),
            maxPriorityFeePerGas: formatGwei(newGasPrice.maxPriorityFeePerGas),
            gasConfig: cleanGasConfig,
            ...(newGasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(newGasPrice.maxFeePerBlobGas) }),
          });

          currentTxHash = newHash;

          (isCancelTx ? cancelTxHashes : txHashes).push(currentTxHash);
          lastAttemptSent = this.dateProvider.now();
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

    // The transaction has timed out. If it's a cancellation then we are giving up on it.
    // Otherwise we may attempt to cancel it if configured to do so.
    if (isCancelTx) {
      this.updateState(state, TxUtilsState.NOT_MINED);
    } else if (gasConfig.cancelTxOnTimeout) {
      // Fire cancellation without awaiting to avoid blocking the main thread
      this.attemptTxCancellation(state, attempts).catch(err => {
        const viemError = formatViemError(err);
        this.logger?.error(`Failed to send cancellation for timed out tx ${currentTxHash}:`, viemError.message, {
          metaMessages: viemError.metaMessages,
        });
      });
    }

    this.logger?.warn(`L1 transaction ${currentTxHash} timed out`, {
      txHash: currentTxHash,
      txTimeoutAt: gasConfig.txTimeoutAt,
      txTimeoutMs: gasConfig.txTimeoutMs,
      txInitialTime: initialTxTime,
      now: this.dateProvider.now(),
      attempts,
      isInterrupted: this.interrupted,
    });

    throw new TimeoutError(`L1 transaction ${currentTxHash} timed out`);
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
  ): Promise<{ receipt: TransactionReceipt; state: L1TxState }> {
    const { state } = await this.sendTransaction(request, gasConfig, blobInputs);
    const receipt = await this.monitorTransaction(state);
    return { receipt, state };
  }

  public override async simulate(
    request: L1TxRequest & { gas?: bigint; from?: Hex },
    _blockOverrides: BlockOverrides<bigint, number> = {},
    stateOverrides: StateOverride = [],
    abi: Abi = RollupAbi,
    _gasConfig?: L1TxUtilsConfig & { fallbackGasEstimate?: bigint; ignoreBlockGasLimit?: boolean },
  ): Promise<{ gasUsed: bigint; result: `0x${string}` }> {
    const blockOverrides = { ..._blockOverrides };
    const gasConfig = { ...this.config, ..._gasConfig };
    const gasPrice = await this.getGasPrice(gasConfig, false);

    const call: any = {
      to: request.to!,
      data: request.data,
      from: request.from ?? this.getSenderAddress().toString(),
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      gas: request.gas ?? LARGE_GAS_LIMIT,
    };

    if (!request.gas && !gasConfig.ignoreBlockGasLimit) {
      // LARGE_GAS_LIMIT is set as call.gas, increase block gasLimit
      blockOverrides.gasLimit = LARGE_GAS_LIMIT * 2n;
    }

    return this._simulate(call, blockOverrides, stateOverrides, gasConfig, abi);
  }

  /**
   * Attempts to cancel a transaction by sending a 0-value tx to self with same nonce but higher gas prices
   * @returns The hash of the cancellation transaction
   */
  protected async attemptTxCancellation(state: L1TxState, attempts: number) {
    const isBlobTx = state.blobInputs !== undefined;
    const { nonce, gasPrice: previousGasPrice } = state;

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

    const { maxFeePerGas, maxPriorityFeePerGas, maxFeePerBlobGas } = cancelGasPrice;
    this.logger?.info(
      `Attempting to cancel L1 ${isBlobTx ? 'blob' : 'vanilla'} transaction ${state.txHashes[0]} with nonce ${nonce}`,
      {
        maxFeePerGas: formatGwei(maxFeePerGas),
        maxPriorityFeePerGas: formatGwei(maxPriorityFeePerGas),
        ...(maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(maxFeePerBlobGas) }),
      },
    );

    const request = {
      to: this.getSenderAddress().toString(),
      value: 0n,
    };

    // Send 0-value tx to self with higher gas price
    const baseTxData = {
      ...request,
      nonce,
      gas: 21_000n,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };

    const txData = isBlobTx ? { ...baseTxData, ...this.makeEmptyBlobInputs(maxFeePerBlobGas!) } : baseTxData;
    const signedRequest = await this.prepareSignedTransaction(txData);
    const cancelTxHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

    state.gasPrice = cancelGasPrice;
    state.gasLimit = 21_000n;
    state.cancelTxHashes.push(cancelTxHash);

    this.updateState(state, TxUtilsState.CANCELLED);

    this.logger?.info(`Sent cancellation tx ${cancelTxHash} for timed out tx with nonce ${nonce}`, {
      nonce,
      txData,
      isBlobTx,
      txHashes: state.txHashes,
    });

    const { transactionHash } = await this.monitorTransaction(state);
    return transactionHash;
  }

  /** Makes empty blob inputs for the cancellation tx. To be overridden in L1TxUtilsWithBlobs. */
  protected makeEmptyBlobInputs(_maxFeePerBlobGas: bigint): Required<L1BlobInputs> {
    throw new Error('Cannot make empty blob inputs for cancellation');
  }
}
