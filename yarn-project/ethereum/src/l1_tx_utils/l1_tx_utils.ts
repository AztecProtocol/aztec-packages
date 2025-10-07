import { maxBigint } from '@aztec/foundation/bigint';
import { merge, pick } from '@aztec/foundation/collection';
import { InterruptError, TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import pickBy from 'lodash.pickby';
import {
  type Abi,
  type BlockOverrides,
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
import type { IL1TxMetrics, IL1TxStore } from './interfaces.js';
import { ReadOnlyL1TxUtils } from './readonly_l1_tx_utils.js';
import {
  DroppedTransactionError,
  type L1BlobInputs,
  type L1TxConfig,
  type L1TxRequest,
  type L1TxState,
  type SigningCallback,
  TerminalTxUtilsState,
  TxUtilsState,
  UnknownMinedTxError,
} from './types.js';

const MAX_L1_TX_STATES = 32;

export class L1TxUtils extends ReadOnlyL1TxUtils {
  protected nonceManager: NonceManager;
  protected txs: L1TxState[] = [];

  constructor(
    public override client: ViemClient,
    public address: EthAddress,
    protected signer: SigningCallback,
    logger: Logger = createLogger('ethereum:publisher'),
    dateProvider: DateProvider = new DateProvider(),
    config?: Partial<L1TxUtilsConfig>,
    debugMaxGasLimit: boolean = false,
    protected store?: IL1TxStore,
    protected metrics?: IL1TxMetrics,
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

  protected async updateState(l1TxState: L1TxState, newState: TxUtilsState.MINED, l1Timestamp: number): Promise<void>;
  protected async updateState(l1TxState: L1TxState, newState: TxUtilsState, l1Timestamp?: undefined): Promise<void>;
  protected async updateState(l1TxState: L1TxState, newState: TxUtilsState, l1Timestamp?: number) {
    const oldState = l1TxState.status;
    l1TxState.status = newState;
    const sender = this.getSenderAddress().toString();
    this.logger.debug(
      `Tx state changed from ${TxUtilsState[oldState]} to ${TxUtilsState[newState]} for nonce ${l1TxState.nonce} account ${sender}`,
    );

    // Record metrics
    if (newState === TxUtilsState.MINED && l1Timestamp !== undefined) {
      this.metrics?.recordMinedTx(l1TxState, new Date(l1Timestamp));
    } else if (newState === TxUtilsState.NOT_MINED) {
      this.metrics?.recordDroppedTx(l1TxState);
    }

    // Update state in the store
    await this.store
      ?.saveState(sender, l1TxState)
      .catch(err => this.logger.error('Failed to persist L1 tx state', err));
  }

  public updateConfig(newConfig: Partial<L1TxUtilsConfig>) {
    this.config = merge(this.config, newConfig);
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

  /**
   * Rehydrates transaction states from the store and resumes monitoring for pending transactions.
   * This should be called on startup to restore state and resume monitoring of any in-flight transactions.
   */
  public async loadStateAndResumeMonitoring(): Promise<void> {
    if (!this.store) {
      return;
    }

    const account = this.getSenderAddress().toString();
    const loadedStates = await this.store.loadStates(account);

    if (loadedStates.length === 0) {
      this.logger.debug(`No states to rehydrate for account ${account}`);
      return;
    }

    // Convert loaded states (which have id) to the txs format
    this.txs = loadedStates;
    this.logger.info(`Rehydrated ${loadedStates.length} tx states for account ${account}`);

    // Find all pending states and resume monitoring
    const pendingStates = loadedStates.filter(state => !TerminalTxUtilsState.includes(state.status));
    if (pendingStates.length === 0) {
      return;
    }

    this.logger.info(`Resuming monitoring for ${pendingStates.length} pending transactions for account ${account}`, {
      txs: pendingStates.map(s => ({ id: s.id, nonce: s.nonce, status: TxUtilsState[s.status] })),
    });

    for (const state of pendingStates) {
      void this.monitorTransaction(state).catch(err => {
        this.logger.error(
          `Error monitoring rehydrated tx with nonce ${state.nonce} for account ${account}`,
          formatViemError(err),
          { nonce: state.nonce, account },
        );
      });
    }
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
    gasConfigOverrides?: L1TxConfig,
    blobInputs?: L1BlobInputs,
    stateChange: TxUtilsState = TxUtilsState.SENT,
  ): Promise<{ txHash: Hex; state: L1TxState }> {
    if (this.interrupted) {
      throw new InterruptError(`Transaction sending is interrupted`);
    }

    try {
      const gasConfig = merge(this.config, gasConfigOverrides);
      const account = this.getSenderAddress().toString();

      let gasLimit: bigint;
      if (this.debugMaxGasLimit) {
        gasLimit = LARGE_GAS_LIMIT;
      } else if (gasConfig.gasLimit) {
        gasLimit = gasConfig.gasLimit;
      } else {
        gasLimit = await this.estimateGas(account, request, gasConfig);
      }
      this.logger.trace(`Computed gas limit ${gasLimit}`, { gasLimit, ...request });

      const gasPrice = await this.getGasPrice(gasConfig, !!blobInputs);

      if (this.interrupted) {
        throw new InterruptError(`Transaction sending is interrupted`);
      }

      const nonce = await this.nonceManager.consume({
        client: this.client,
        address: account,
        chainId: this.client.chain.id,
      });

      const baseState = { request, gasLimit, blobInputs, gasPrice, nonce };
      const txData = this.makeTxData(baseState, { isCancelTx: false });

      const now = new Date(await this.getL1Timestamp());
      if (gasConfig.txTimeoutAt && now > gasConfig.txTimeoutAt) {
        throw new TimeoutError(
          `Transaction timed out before sending (now ${now.toISOString()} > timeoutAt ${gasConfig.txTimeoutAt.toISOString()})`,
        );
      }

      // Send the new tx
      const signedRequest = await this.prepareSignedTransaction(txData);
      const txHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

      // Create the new state for monitoring
      const l1TxState: L1TxState = {
        ...baseState,
        id: (await this.store?.consumeNextStateId(account)) ?? Math.max(...this.txs.map(tx => tx.id), 0),
        txHashes: [txHash],
        cancelTxHashes: [],
        status: TxUtilsState.IDLE,
        txConfigOverrides: gasConfigOverrides ?? {},
        sentAtL1Ts: now,
        lastSentAtL1Ts: now,
      };

      // And persist it
      await this.updateState(l1TxState, stateChange);
      await this.store?.saveBlobs(account, l1TxState.id, blobInputs);
      this.txs.push(l1TxState);

      // Clean up stale states
      if (this.txs.length > MAX_L1_TX_STATES) {
        const removed = this.txs.shift();
        if (removed && this.store) {
          await this.store.deleteState(account, removed.id);
        }
      }

      this.logger.info(`Sent L1 transaction ${txHash}`, {
        to: request.to,
        value: request.value,
        nonce,
        account,
        sentAt: now,
        gasLimit,
        maxFeePerGas: formatGwei(gasPrice.maxFeePerGas),
        maxPriorityFeePerGas: formatGwei(gasPrice.maxPriorityFeePerGas),
        ...(gasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(gasPrice.maxFeePerBlobGas) }),
        isBlobTx: !!blobInputs,
        txConfig: gasConfigOverrides,
      });

      return { txHash, state: l1TxState };
    } catch (err: any) {
      const viemError = formatViemError(err, request.abi);
      this.logger.error(`Failed to send L1 transaction`, viemError, {
        request: pick(request, 'to', 'value'),
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
          const account = this.getSenderAddress().toString();
          const what = isCancelTx ? 'Cancellation L1 transaction' : 'L1 transaction';
          if (receipt.status === 'reverted') {
            this.logger.warn(`${what} ${hash} with nonce ${nonce} reverted`, { receipt, nonce, account });
          } else {
            this.logger.info(`${what} ${hash} with nonce ${nonce} mined`, { receipt, nonce, account });
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
   * Returns whether a given tx should be considered as timed out and no longer monitored.
   * Relies on the txTimeout setting for user txs, and on the txCancellationTimeout for cancel txs.
   * @remarks We check against the latestBlockTimestamp as opposed to the current time to avoid a race condition where
   * the tx is mined in a block with the same timestamp as txTimeoutAt, but our execution node has not yet processed it,
   * or the loop here has not yet checked the tx before that timeout.
   */
  private isTxTimedOut(state: L1TxState, l1Timestamp: number) {
    const account = this.getSenderAddress().toString();
    const { nonce } = state;

    const txConfig = merge(this.config, state.txConfigOverrides);
    const { txTimeoutAt, txTimeoutMs, maxSpeedUpAttempts } = txConfig;
    const isCancelTx = state.cancelTxHashes.length > 0;

    this.logger.trace(`Tx timeout check for ${account} with nonce ${nonce}`, {
      nonce,
      account,
      l1Timestamp,
      lastAttemptSent: state.lastSentAtL1Ts.getTime(),
      initialTxTime: state.sentAtL1Ts.getTime(),
      now: this.dateProvider.now(),
      txTimeoutAt,
      txTimeoutMs,
      interrupted: this.interrupted,
    });

    if (this.interrupted) {
      this.logger.warn(`Tx monitoring interrupted during nonce ${nonce} for ${account} check`, { nonce, account });
      return true;
    }

    if (isCancelTx) {
      // Note that we check against the lastSentAt time for cancellations, since we time them out
      // after the last attempt to submit them, not the initial time.
      const attempts = state.cancelTxHashes.length;
      return (
        attempts > maxSpeedUpAttempts &&
        state.lastSentAtL1Ts.getTime() + txConfig.txCancellationFinalTimeoutMs! <= l1Timestamp
      );
    }

    return (
      (txTimeoutAt !== undefined && l1Timestamp >= txTimeoutAt.getTime()) ||
      (txTimeoutMs !== undefined && txTimeoutMs > 0 && l1Timestamp - state.sentAtL1Ts.getTime() >= txTimeoutMs)
    );
  }

  /**
   * Monitors a transaction until completion, handling speed-ups if needed
   */
  protected async monitorTransaction(state: L1TxState): Promise<TransactionReceipt> {
    const { nonce, gasLimit, blobInputs, txConfigOverrides: gasConfigOverrides } = state;
    const gasConfig = merge(this.config, gasConfigOverrides);
    const { maxSpeedUpAttempts, stallTimeMs } = gasConfig;
    const isCancelTx = state.cancelTxHashes.length > 0;
    const txHashes = isCancelTx ? state.cancelTxHashes : state.txHashes;
    const isBlobTx = !!blobInputs;
    const account = this.getSenderAddress().toString();

    const initialTxHash = txHashes[0];
    let currentTxHash = txHashes.at(-1)!;
    let l1Timestamp: number;

    while (true) {
      l1Timestamp = await this.getL1Timestamp();

      try {
        const timePassed = l1Timestamp - state.lastSentAtL1Ts.getTime();
        const [currentNonce, pendingNonce] = await Promise.all([
          this.client.getTransactionCount({ address: account, blockTag: 'latest' }),
          this.client.getTransactionCount({ address: account, blockTag: 'pending' }),
        ]);

        // If the current nonce on our account is greater than our transaction's nonce then a tx with the same nonce has been mined.
        if (currentNonce > nonce) {
          // We try getting the receipt twice, since sometimes anvil fails to return it if the tx has just been mined
          const receipt =
            (await this.tryGetTxReceipt(state.cancelTxHashes, nonce, true)) ??
            (await this.tryGetTxReceipt(state.txHashes, nonce, false)) ??
            (await sleep(500)) ??
            (await this.tryGetTxReceipt(state.cancelTxHashes, nonce, true)) ??
            (await this.tryGetTxReceipt(state.txHashes, nonce, false));

          if (receipt) {
            state.receipt = receipt;
            await this.updateState(state, TxUtilsState.MINED, l1Timestamp);
            return receipt;
          }

          // If we get here then we have checked all of our tx versions and not found anything.
          // We should consider the nonce as MINED
          await this.updateState(state, TxUtilsState.MINED, l1Timestamp);
          throw new UnknownMinedTxError(nonce, account);
        }

        // If this is a cancel tx and its nonce is no longer on the mempool, we consider it dropped and stop monitoring
        // If it is a regular tx, we let the loop speed it up after the stall time
        if (isCancelTx && pendingNonce <= nonce && timePassed >= gasConfig.txUnseenConsideredDroppedMs) {
          this.logger.warn(
            `Cancellation tx with nonce ${nonce} for account ${account} has been dropped from the visible mempool`,
            { nonce, account, pendingNonce, timePassed },
          );
          await this.updateState(state, TxUtilsState.NOT_MINED);
          this.nonceManager.reset({ address: account, chainId: this.client.chain.id });
          throw new DroppedTransactionError(nonce, account);
        }

        // Break if the tx has timed out (ie expired)
        if (this.isTxTimedOut(state, l1Timestamp)) {
          break;
        }

        // Speed up the transaction if it appears to be stuck (exceeded stall time and still have retry attempts)
        const attempts = txHashes.length;
        if (timePassed >= stallTimeMs && attempts <= maxSpeedUpAttempts) {
          const newGasPrice = await this.getGasPrice(gasConfig, isBlobTx, attempts, state.gasPrice);
          state.gasPrice = newGasPrice;

          this.logger.debug(
            `Tx ${currentTxHash} with nonce ${nonce} from ${account} appears stuck. ` +
              `Attempting speed-up ${attempts}/${maxSpeedUpAttempts} ` +
              `with new priority fee ${formatGwei(newGasPrice.maxPriorityFeePerGas)} gwei.`,
            {
              account,
              nonce,
              maxFeePerGas: formatGwei(newGasPrice.maxFeePerGas),
              maxPriorityFeePerGas: formatGwei(newGasPrice.maxPriorityFeePerGas),
              ...(newGasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(newGasPrice.maxFeePerBlobGas) }),
            },
          );

          const txData = this.makeTxData(state, { isCancelTx });

          const signedRequest = await this.prepareSignedTransaction(txData);
          const newHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

          this.logger.verbose(
            `Sent L1 speed-up tx ${newHash} replacing ${currentTxHash} for nonce ${nonce} from ${account}`,
            {
              nonce,
              account,
              gasLimit,
              maxFeePerGas: formatGwei(newGasPrice.maxFeePerGas),
              maxPriorityFeePerGas: formatGwei(newGasPrice.maxPriorityFeePerGas),
              txConfig: state.txConfigOverrides,
              ...(newGasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(newGasPrice.maxFeePerBlobGas) }),
            },
          );

          currentTxHash = newHash;
          txHashes.push(currentTxHash);
          state.lastSentAtL1Ts = new Date(l1Timestamp);
          await this.updateState(state, isCancelTx ? TxUtilsState.CANCELLED : TxUtilsState.SPEED_UP);

          await sleep(gasConfig.checkIntervalMs!);
          continue;
        }

        this.logger.debug(
          `Tx ${currentTxHash} from ${account} with nonce ${nonce} still pending after ${timePassed}ms`,
          {
            account,
            nonce,
            pendingNonce,
            attempts,
            timePassed,
            isBlobTx,
            isCancelTx,
            ...pick(state.gasPrice, 'maxFeePerGas', 'maxPriorityFeePerGas', 'maxFeePerBlobGas'),
            ...pick(
              gasConfig,
              'txUnseenConsideredDroppedMs',
              'txCancellationFinalTimeoutMs',
              'maxSpeedUpAttempts',
              'stallTimeMs',
              'txTimeoutAt',
              'txTimeoutMs',
            ),
          },
        );

        await sleep(gasConfig.checkIntervalMs!);
      } catch (err: any) {
        if (err instanceof DroppedTransactionError || err instanceof UnknownMinedTxError) {
          throw err;
        }

        const viemError = formatViemError(err);
        this.logger.error(`Error while monitoring L1 tx ${currentTxHash}`, viemError, { nonce, account });
        await sleep(gasConfig.checkIntervalMs!);
      }
    }

    // Oh no, the transaction has timed out!
    if (isCancelTx || !gasConfig.cancelTxOnTimeout) {
      // If this was already a cancellation tx, or we are configured to not cancel txs, we just mark it as NOT_MINED
      // and reset the nonce manager, so the next tx that comes along can reuse the nonce if/when this tx gets dropped.
      // This is the nastiest scenario for us, since the new tx could acquire the next nonce, but then this tx is dropped,
      // and the new tx would never get mined. Eventually, the new tx would also drop.
      await this.updateState(state, TxUtilsState.NOT_MINED);
      this.nonceManager.reset({ address: account, chainId: this.client.chain.id });
    } else {
      // Otherwise we fire the cancellation without awaiting to avoid blocking the caller,
      // and monitor it in the background so we can speed it up as needed.
      void this.attemptTxCancellation(state).catch(async err => {
        await this.updateState(state, TxUtilsState.NOT_MINED);
        this.logger.error(`Failed to send cancellation for timed out tx ${initialTxHash} with nonce ${nonce}`, err, {
          account,
          nonce,
          initialTxHash,
        });
      });
    }

    const what = isCancelTx ? 'Cancellation L1' : 'L1';
    this.logger.warn(`${what} transaction ${initialTxHash} with nonce ${nonce} from ${account} timed out`, {
      initialTxHash,
      currentTxHash,
      nonce,
      account,
      txTimeoutAt: gasConfig.txTimeoutAt?.getTime(),
      txTimeoutMs: gasConfig.txTimeoutMs,
      txInitialTime: state.sentAtL1Ts.getTime(),
      l1Timestamp,
      now: this.dateProvider.now(),
      attempts: txHashes.length - 1,
      isInterrupted: this.interrupted,
    });

    throw new TimeoutError(`L1 transaction ${initialTxHash} timed out`);
  }

  /**
   * Creates tx data to be signed by viem signTransaction method, using the state as input.
   * If isCancelTx is true, creates a 0-value tx to self with 21k gas and no data instead,
   * and an empty blob input if the original tx also had blobs.
   */
  private makeTxData(
    state: Pick<L1TxState, 'request' | 'gasLimit' | 'blobInputs' | 'gasPrice' | 'nonce'>,
    opts: { isCancelTx: boolean },
  ): PrepareTransactionRequestRequest {
    const { request, gasLimit, blobInputs, gasPrice, nonce } = state;
    const isBlobTx = blobInputs !== undefined;

    const baseTxOpts = { nonce, ...pick(gasPrice, 'maxFeePerGas', 'maxPriorityFeePerGas') };

    if (opts.isCancelTx) {
      const baseTxData = {
        to: this.getSenderAddress().toString(),
        value: 0n,
        data: '0x' as const,
        gas: 21_000n,
        ...baseTxOpts,
      };

      return isBlobTx ? { ...baseTxData, ...this.makeEmptyBlobInputs(gasPrice.maxFeePerBlobGas!) } : baseTxData;
    }

    const baseTxData = {
      ...request,
      ...baseTxOpts,
      gas: gasLimit,
    };

    return blobInputs ? { ...baseTxData, ...blobInputs, maxFeePerBlobGas: gasPrice.maxFeePerBlobGas! } : baseTxData;
  }

  /** Returns when all monitor loops have stopped. */
  public async waitMonitoringStopped(timeoutSeconds = 10) {
    const account = this.getSenderAddress().toString();
    await retryUntil(
      () => this.txs.every(tx => TerminalTxUtilsState.includes(tx.status)),
      `monitoring stopped for ${account}`,
      timeoutSeconds,
      0.1,
    ).catch(() => this.logger.warn(`Timeout waiting for monitoring loops to stop for ${account}`));
  }

  /**
   * Sends a transaction and monitors it until completion
   * @param request - The transaction request (to, data, value)
   * @param gasConfig - Optional gas configuration
   * @returns The receipt of the successful transaction
   */
  public async sendAndMonitorTransaction(
    request: L1TxRequest,
    gasConfig?: L1TxConfig,
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
    const gasConfig = merge(this.config, _gasConfig);
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
   * Only sends the cancellation if the original tx is still pending, not if it was dropped
   * @returns The hash of the cancellation transaction
   */
  protected async attemptTxCancellation(state: L1TxState): Promise<void> {
    const isBlobTx = state.blobInputs !== undefined;
    const { nonce, gasPrice: previousGasPrice } = state;
    const account = this.getSenderAddress().toString();

    // Do not send cancellation if interrupted
    if (this.interrupted) {
      this.logger.warn(
        `Not sending cancellation for L1 tx from account ${account} with nonce ${nonce} as interrupted`,
        { nonce, account },
      );
      await this.updateState(state, TxUtilsState.NOT_MINED);
      this.nonceManager.reset({ address: account, chainId: this.client.chain.id });
      return;
    }

    // Check if the original tx is still pending
    const currentNonce = await this.client.getTransactionCount({ address: account, blockTag: 'pending' });
    if (currentNonce < nonce) {
      this.logger.verbose(
        `Not sending cancellation for L1 tx from account ${account} with nonce ${nonce} as it is dropped`,
        { nonce, account, currentNonce },
      );
      await this.updateState(state, TxUtilsState.NOT_MINED);
      this.nonceManager.reset({ address: account, chainId: this.client.chain.id });
      return;
    }

    // Get gas price with higher priority fee for cancellation
    const cancelGasPrice = await this.getGasPrice(
      {
        ...this.config,
        // Use high bump for cancellation to ensure it replaces the original tx
        priorityFeeRetryBumpPercentage: 150, // 150% bump should be enough to replace any tx
      },
      isBlobTx,
      state.txHashes.length,
      previousGasPrice,
    );

    const { maxFeePerGas, maxPriorityFeePerGas, maxFeePerBlobGas } = cancelGasPrice;
    this.logger.verbose(
      `Attempting to cancel L1 ${isBlobTx ? 'blob' : 'vanilla'} transaction from account ${account} with nonce ${nonce} after time out`,
      {
        maxFeePerGas: formatGwei(maxFeePerGas),
        maxPriorityFeePerGas: formatGwei(maxPriorityFeePerGas),
        ...(maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(maxFeePerBlobGas) }),
      },
    );

    // Send 0-value tx to self with higher gas price
    state.gasPrice = cancelGasPrice;
    state.lastSentAtL1Ts = new Date(await this.getL1Timestamp());

    const txData = this.makeTxData(state, { isCancelTx: true });
    const signedRequest = await this.prepareSignedTransaction(txData);
    const cancelTxHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

    state.cancelTxHashes.push(cancelTxHash);
    await this.updateState(state, TxUtilsState.CANCELLED);

    this.logger.warn(`Sent cancellation tx ${cancelTxHash} for timed out tx from ${account} with nonce ${nonce}`, {
      nonce,
      cancelGasPrice,
      isBlobTx,
      txHashes: state.txHashes,
    });

    // Do not await the cancel tx to be mined
    void this.monitorTransaction(state).catch(err => {
      this.logger.error(`Failed to mine cancellation tx ${cancelTxHash} for nonce ${nonce} account ${account}`, err, {
        nonce,
        account,
        cancelTxHash,
      });
    });
  }

  /** Returns L1 timestamps in milliseconds */
  private async getL1Timestamp() {
    const { timestamp } = await this.client.getBlock({ blockTag: 'latest', includeTransactions: false });
    return Number(timestamp) * 1000;
  }

  /** Makes empty blob inputs for the cancellation tx. To be overridden in L1TxUtilsWithBlobs. */
  protected makeEmptyBlobInputs(_maxFeePerBlobGas: bigint): Required<L1BlobInputs> {
    throw new Error('Cannot make empty blob inputs for cancellation');
  }
}
