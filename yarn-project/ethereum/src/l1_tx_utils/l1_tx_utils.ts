import { times } from '@aztec/foundation/collection';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { promiseRaceSuccess, promiseWithResolvers } from '@aztec/foundation/promise';
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
  type GasPrice,
  type L1BlobInputs,
  type L1PendingTx,
  type L1TxConfig,
  type L1TxRequest,
  ReplacedL1TxError,
  type SigningCallback,
  TxUtilsState,
} from './types.js';

/** Used for enriching logging messages */
type L1RequestInfo = {
  isCancelTx?: boolean;
  nonce: number;
  account: Hex;
};

type L1TxContext = {
  lastSentAt: Date;
  lastTxHash: Hex;
  monitorController: AbortController;
  monitorPromise: Promise<void>;
  allVersions: Set<Hex>;
  requestInfo: L1RequestInfo;
  txRequest: L1TxRequest;
  txOpts: Partial<L1TxUtilsConfig> & {
    txTimeoutAt?: Date;
    gasLimit?: bigint;
    blobInputs?: L1BlobInputs;
  };
};

export class L1TxUtils extends ReadOnlyL1TxUtils {
  private txUtilsState: TxUtilsState = TxUtilsState.IDLE;
  private lastMinedBlockNumber: bigint | undefined = undefined;
  private nonceManager: NonceManager;
  private pendingRequest: L1PendingTx | undefined;

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
    return this.txUtilsState;
  }

  public get lastMinedAtBlockNumber() {
    return this.lastMinedBlockNumber;
  }

  private set lastMinedAtBlockNumber(blockNumber: bigint | undefined) {
    this.lastMinedBlockNumber = blockNumber;
  }

  private set state(state: TxUtilsState) {
    const oldState = this.txUtilsState;
    this.txUtilsState = state;
    this.logger?.debug(
      `L1TxUtils state changed from ${TxUtilsState[oldState]} to ${TxUtilsState[state]} for sender ${this.getSenderAddress().toString()}`,
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

  private async sendTxRequest(request: L1TxRequest, opts: { nonce: number; gasPrice?: GasPrice; gasLimit?: bigint }) {
    let { nonce, gasPrice, gasLimit } = opts;

    // gasLimit ??= await this.getGasLimit(request, );

    const baseTxRequestOpts = {
      ...request,
      gas: gasLimit,
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      nonce,
    };

    const txRequestOpts = blobInputs
      ? { ...blobInputs, ...baseTxRequestOpts, maxFeePerBlobGas: gasPrice.maxFeePerBlobGas! }
      : baseTxRequestOpts;

    this.pendingRequest = { request, attempts: 0, nonce, gasPrice, txHash: undefined };

    const signedRequest = await this.prepareSignedTransaction(txRequestOpts);
    const txHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

    if (this.pendingRequest?.request === request) {
      this.pendingRequest.txHash = txHash;
    }

    this.state = stateChange;
    this.logger?.info(`Sent L1 transaction ${txHash}`, {
      gasLimit,
      maxFeePerGas: formatGwei(gasPrice.maxFeePerGas),
      maxPriorityFeePerGas: formatGwei(gasPrice.maxPriorityFeePerGas),
      gasConfig,
      ...(gasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(gasPrice.maxFeePerBlobGas) }),
    });
  }

  private monitorController: AbortController;

  private context: L1TxContext | undefined;

  /**
   * Sends a transaction with gas estimation and pricing
   * @param request - The transaction request (to, data, value)
   * @param gasConfig - Optional gas configuration
   * @returns The transaction hash and parameters used
   */
  public async sendAndMonitorTransaction3(
    request: L1TxRequest,
    userTxConfig?: L1TxConfig,
    blobInputs?: L1BlobInputs,
  ): Promise<{ txHash: Hex; gasLimit: bigint; gasPrice: GasPrice }> {
    // Abort current loop if running and wait until it completes
    // DO NOT ABORT HERE
    this.context?.monitorController?.abort();
    await (this.context?.monitorPromise ?? Promise.resolve());

    // Resolve tx-specific config
    const txConfig = pickBy({ ...this.config, ...userTxConfig }, (_, key) => key in l1TxUtilsConfigMappings);

    // If we have a tx in flight, then we replace it if allowed
    if (!this.isInState(TxUtilsState.IDLE, TxUtilsState.TX_MINED) && this.context) {
      if (!this.config.replacePreviousPendingTx) {
        // THROW OR WAIT?
        throw new Error('Cannot send transaction while another is pending');
      }

      this.logger.verbose(`Replacing previous pending tx ${nonce} from ${account} with new request`, {
        pending: this.previousRequestInfo,
        current: requestInfo,
      });

      const gasPrice = await this.getGasPrice(
        txConfig,
        !!blobInputs,
        this.pendingRequest.attempts + 1,
        this.pendingRequest.gasPrice,
      );
    }

    try {
      const gasConfig = pickBy({ ...this.config, ...userGasConfig }, (_, key) => key in l1TxUtilsConfigMappings);
      const gasLimit = await this.getGasLimit(request, gasConfig);
      this.logger?.debug(`Gas limit for request is ${gasLimit}`, { gasLimit, ...request });

      if (
        gasConfig.txTimeoutAt &&
        gasConfig.txTimeoutAt instanceof Date &&
        this.dateProvider.now() > gasConfig.txTimeoutAt.getTime()
      ) {
        throw new Error('Transaction timed out before sending');
      }

      const { gasPrice, nonce } = await this.getTxOpts(request, gasConfig, blobInputs);

      const baseTxRequestOpts = {
        ...request,
        gas: gasLimit,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
        nonce,
      };

      const txRequestOpts = blobInputs
        ? { ...blobInputs, ...baseTxRequestOpts, maxFeePerBlobGas: gasPrice.maxFeePerBlobGas! }
        : baseTxRequestOpts;

      this.pendingRequest = { request, attempts: 0, nonce, gasPrice, txHash: undefined };

      const signedRequest = await this.prepareSignedTransaction(txRequestOpts);
      const txHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

      if (this.pendingRequest?.request === request) {
        this.pendingRequest.txHash = txHash;
      }

      this.state = stateChange;
      this.logger?.info(`Sent L1 transaction ${txHash}`, {
        gasLimit,
        maxFeePerGas: formatGwei(gasPrice.maxFeePerGas),
        maxPriorityFeePerGas: formatGwei(gasPrice.maxPriorityFeePerGas),
        gasConfig,
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

  private getGasLimit(request: L1TxRequest, gasConfig: L1TxConfig) {
    if (this.debugMaxGasLimit) {
      return LARGE_GAS_LIMIT;
    } else if (gasConfig?.gasLimit !== undefined) {
      return gasConfig.gasLimit;
    } else {
      return this.estimateGas(this.getSenderAddress().toString(), request, gasConfig);
    }
  }

  private async getTxOpts(request: L1TxRequest, gasConfig?: L1TxConfig, blobInputs?: L1BlobInputs) {
    const getDefaultTxOpts = async () => ({
      gasPrice: await this.getGasPrice(gasConfig, !!blobInputs),
      nonce: await this.nonceManager.consume({
        client: this.client,
        address: this.getSenderAddress().toString(),
        chainId: this.client.chain.id,
      }),
    });

    // If we dont care about replacing the previous pending tx, just return the gas price
    if (!this.config.replacePreviousPendingTx) {
      return getDefaultTxOpts();
    }

    // Otherwise, first check if the pending request is still pending; if not, clear it.
    // TODO(palla/txs): It could be the case that, if we rebooted the node recently, we lost track of the pendingRequest.
    // We could detect that by comparing the latest and pending nonces, if they differ, it means there are outstanding pending txs.
    // Issue is we have no way of retrieving that pending tx (since eth_getTransactionBySenderAndNonce is not standard yet), so
    // we should persist the tx request to db.
    if (this.pendingRequest) {
      const currentNonce = await this.client.getTransactionCount({
        address: this.getSenderAddress().toString(),
        blockTag: 'latest',
      });
      if (currentNonce > this.pendingRequest.nonce) {
        this.logger?.debug(
          `Clearing pending tx request with nonce ${this.pendingRequest.nonce} since current nonce is ${currentNonce}`,
          { pending: this.pendingRequest, currentNonce },
        );
        this.pendingRequest = undefined;
      }
    }

    // If there is a pending request, then replace it with the new one
    if (this.pendingRequest) {
      this.logger?.debug(
        `Replacing previous pending transaction ${this.pendingRequest.txHash ?? this.pendingRequest.nonce} with new request`,
        { pending: this.pendingRequest, request },
      );
      const gasPrice = await this.getGasPrice(
        gasConfig,
        !!blobInputs,
        this.pendingRequest.attempts + 1,
        this.pendingRequest.gasPrice,
      );
      return { gasPrice, nonce: this.pendingRequest.nonce };
    }

    return getDefaultTxOpts();
  }

  private monitorPromise: Promise<void> | undefined;

  private lastSentAt;

  private async doSendTransaction() {}

  public async sendAndMonitorTransaction2(
    request: L1TxRequest,
    userGasConfig?: Partial<L1TxUtilsConfig>,
    blobInputs?: L1BlobInputs,
  ): Promise<TransactionReceipt> {}

  private async monitorTransaction2(
    request: L1TxRequest,
    initialTxHash: Hex,
    allVersions: Set<Hex>,
    txOpts: Partial<L1TxUtilsConfig> & {
      txTimeoutAt?: Date;
      gasLimit: bigint;
      blobInputs?: L1BlobInputs;
      isCancelTx?: boolean;
    },
  ) {
    let lastBlockNumber: bigint | undefined;

    let interrupted: boolean;
    let requestInfo: L1RequestInfo = {} as any;

    let account: Hex = `0x1`;
    let nonce: number = 0;

    let config: L1TxConfig = {} as any;

    let previousVersions: Set<Hex> = new Set();
    let previousRequestInfo: L1RequestInfo = {} as any;

    // Loop until we revert back to IDLE state
    while (!this.isInState(TxUtilsState.IDLE)) {
      if (this.interrupted) {
        this.logger.verbose(`Transaction monitoring interrupted`, { ...requestInfo });
        break;
      }

      await sleep(1000); // TODO: INTERRUPT

      try {
        // No need to do anything if we are still on the same L1 block
        const blockNumber = await this.client.getBlockNumber();
        if (lastBlockNumber === blockNumber) {
          continue;
        }
        lastBlockNumber = blockNumber;
        this.logger.trace(
          `L1 chain advanced to block ${blockNumber} while monitoring tx ${nonce} from ${account}`,
          requestInfo,
        );

        // => TX_MINED
        // If the current nonce on our account is greater than our transaction's nonce then a tx with the same nonce has been mined
        if (!this.isInState(TxUtilsState.IDLE, TxUtilsState.TX_MINED)) {
          const currentNonce = await this.getNonce('latest');
          if (currentNonce > nonce) {
            // Nonce has advanced, so this tx must have been mined or replaced
            this.logger.debug(`Account mined nonce has advanced to ${currentNonce}`, { ...requestInfo });
            const receipt = await this.tryGetTxReceipt(allVersions, requestInfo);

            // If we find the receipt, return it to the caller, and keep monitoring this tx in the background to flag
            // this instance as IDLE once it's finalized, or to pick up the tx again for speed ups if it gets reorged out
            if (receipt) {
              this.state = TxUtilsState.TX_MINED;
              this.lastMinedAtBlockNumber = receipt.blockNumber;
              void this.monitorTransaction2(request, receipt.transactionHash, allVersions, txOpts).catch(err =>
                this.logger.error(`Error while monitoring mined tx ${nonce} for ${account}`, err, { ...requestInfo }),
              );
              return receipt;
            }

            // If we don't find the receipt, and there was a previously replaced tx, maybe that was the one that got mined,
            // so we need to resubmit the current tx with an updated nonce.
            const receiptFromReplaced = await this.tryGetTxReceipt(previousVersions, previousRequestInfo);
            if (receiptFromReplaced) {
              this.logger.warn(
                `Previously replaced transaction was mined instead of the current one. Resubmitting tx with updated nonce.`,
                { previous: previousRequestInfo, current: requestInfo },
              );
              // TODO: METHOD!!
              this.state = TxUtilsState.TX_MINED;
              monitorPromise.resolve();
              return this.sendAndMonitorTransaction(request, { ...config, nonce: currentNonce + 1 }, txOpts.blobInputs);
            }

            // If we still can't find the receipt, an unknown tx from this account was mined for this nonce. This should
            // not happen unless this private key is being used elsewhere, or there is a bug in our code. So we throw.
            monitorPromise.resolve();
            this.logger.warn(`Transaction ${nonce} from ${account} was replaced by an unknown tx.`, requestInfo);
            throw new ReplacedL1TxError(
              `Transaction ${nonce} from ${account} was replaced by an unknown tx.`,
              currentNonce,
            );
          }
        }

        // TX_MINED => IDLE | TX_SENT
        // If we are in mined state, check if we can revert back to idle after the tx is finalized, or we need to bring it back to sent
        // There is an edge case in which the tx gets reorged out and atomically replaced by a different replacement or noop,
        // so the receipt that we returned to the caller is not valid anymore, but in all our scenarios the caller just forgets about the
        // tx once it's mined.
        if (this.isInState(TxUtilsState.TX_MINED)) {
          const [minedNonce, finalizedNonce] = await Promise.all([this.getNonce('latest'), this.getNonce('finalized')]);
          if (minedNonce < nonce) {
            this.logger.warn(`Transaction ${nonce} from ${account} has been reorged out`, { ...requestInfo });
            this.state = TxUtilsState.TX_SENT;
            // this.pendingRequest = undefined;
          } else if (finalizedNonce >= nonce) {
            this.logger.debug(`Transaction ${nonce} from ${account} has been finalized`, { ...requestInfo });
            this.state = TxUtilsState.IDLE;
            // cleanup everything
          }
          continue;
        }

        // TX_SENT | TX_SPEED_UP_SENT => TX_CANCEL_SENT | TX_TIMED_OUT
        // If the tx has timed out, we may need to send a cancellation or flag it as timed out
        if (this.isInState(TxUtilsState.TX_SENT, TxUtilsState.TX_SPEED_UP_SENT) && config.txTimeoutAt) {
          const blockTime = await this.getBlockTimestamp();
          if (config.txTimeoutAt >= blockTime) {
            callerPromise.reject(new TimeoutError(`L1 transaction timed out`));
            if (config.cancelTxOnTimeout) {
              // FIXME!!!
              await this.attemptTxCancellation(currentTxHash, nonce, allVersions, isBlobTx, lastGasPrice, attempts);
              this.state = TxUtilsState.TX_CANCEL_SENT;
            } else {
              this.state = TxUtilsState.TX_TIMED_OUT;
            }
          }
        }

        // TX_CANCEL_SENT | TX_TIMED_OUT => IDLE
        // If we are timed out, wait until the tx is forgotten for switching back to idle
        if (this.isInState(TxUtilsState.TX_CANCEL_SENT, TxUtilsState.TX_TIMED_OUT)) {
          const pendingNonce = await this.client.getTransactionCount({ address: account, blockTag: 'pending' });
          if (pendingNonce < nonce) {
            this.logger.debug(`Transaction ${nonce} from ${account} has been dropped`, { ...requestInfo });
            this.state = TxUtilsState.IDLE;
            return;
          }
        }

        // TX_SENT | TX_SPEED_UP_SENT | TX_CANCEL_SENT => TX_SPEED_UP_SENT | TX_CANCEL_SENT
        // If the tx is in flight, check if we need to speed it up
        if (this.isInState(TxUtilsState.TX_SENT, TxUtilsState.TX_SPEED_UP_SENT, TxUtilsState.TX_CANCEL_SENT)) {
          const blockTime = await this.getBlockTimestamp();
          // if ()
          // SPEEEEDUP
          this.state =
            this.state === TxUtilsState.TX_CANCEL_SENT ? TxUtilsState.TX_CANCEL_SENT : TxUtilsState.TX_SPEED_UP_SENT;
          continue;
        }

        // TX_SENT | TX_SPEED_UP_SENT => TX_SENT | TX_SPEED_UP_SENT
        // If the tx is in flight and it was lost, resubmit it
        if (this.isInState(TxUtilsState.TX_SENT, TxUtilsState.TX_SPEED_UP_SENT)) {
          const lastTxInMempool = await this.client.getTransaction({ hash: currentTxHash });
          if (!lastTxInMempool) {
            this.logger.verbose(`Resubmitting transaction ${nonce} from ${account} as it was not found in mempool`, {
              currentTxHash,
              ...requestInfo,
            });
            // CATCH IT
            await this.client.sendRawTransaction({ serializedTransaction: lastSignedRequest });
          }
        }
      } catch (err) {
        this.logger.error(`Error monitoring transaction ${initialTxHash}`, { error: err });
      }
    }

    monitorPromise.resolve();
  }

  private getNonce(tag: 'latest' | 'pending' | 'finalized') {
    return this.client.getTransactionCount({ address: this.getSenderAddress().toString(), blockTag: tag });
  }

  private async getBlockTimestamp(): Promise<Date> {
    const { timestamp } = await this.client.getBlock({ blockTag: 'latest', includeTransactions: false });
    return ethereumTimestampToDate(timestamp);
  }

  private async tryGetTxReceipt(allVersions: Set<Hex>, requestInfo: L1RequestInfo) {
    for (const hash of allVersions) {
      try {
        const receipt = await this.client.getTransactionReceipt({ hash });
        if (receipt) {
          const { nonce, account, isCancelTx } = requestInfo;
          if (receipt.status === 'reverted') {
            this.logger.warn(`${isCancelTx ? 'Cancel tx' : 'Tx'} ${nonce} for ${account} with hash ${hash} reverted`, {
              ...receipt,
              ...requestInfo,
            });
          } else {
            this.logger.verbose(`${isCancelTx ? 'Cancel tx' : 'Tx'} ${nonce} for ${account} with hash ${hash} mined`, {
              ...receipt,
              ...requestInfo,
            });
          }
          return receipt;
        }
      } catch (err) {
        this.logger.error(`Error getting receipt for transaction ${hash}`, err, { ...requestInfo });
      }
    }
  }

  private isInState(...states: TxUtilsState[]) {
    return states.includes(this.state);
  }

  /**
   * Monitors a transaction until completion, handling speed-ups if needed
   * @param request - Original transaction request (needed for speed-ups)
   * @param initialTxHash - Hash of the initial transaction
   * @param allVersions - Hashes of all transactions submitted under the same nonce (any of them could mine)
   * @param params - Parameters used in the initial transaction
   * @param gasConfig - Optional gas configuration
   */
  public async monitorTransaction(
    request: L1TxRequest,
    initialTxHash: Hex,
    allVersions: Set<Hex>,
    params: { gasLimit: bigint },
    txOpts?: Partial<L1TxUtilsConfig> & { txTimeoutAt?: Date },
    _blobInputs?: L1BlobInputs,
    isCancelTx: boolean = false,
  ): Promise<TransactionReceipt> {
    const isBlobTx = !!_blobInputs;
    const gasConfig = { ...this.config, ...txOpts };
    const account = this.getSenderAddress().toString();

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

    allVersions.add(initialTxHash);
    let currentTxHash = initialTxHash;
    let attempts = 0;
    let lastAttemptSent = this.dateProvider.now();
    let lastGasPrice: GasPrice = {
      maxFeePerGas: tx.maxFeePerGas!,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas!,
      maxFeePerBlobGas: tx.maxFeePerBlobGas!,
    };
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

        const currentNonce = await this.client.getTransactionCount({ address: account, blockTag: 'latest' });
        // If the current nonce on our account is greater than our transaction's nonce then a tx with the same nonce has been mined.
        if (currentNonce > nonce) {
          for (const hash of allVersions) {
            try {
              const receipt = await this.client.getTransactionReceipt({ hash });
              if (receipt) {
                if (receipt.status === 'reverted') {
                  this.logger?.error(`L1 transaction ${hash} reverted`, receipt);
                } else {
                  this.logger?.debug(`L1 transaction ${hash} mined`);
                }
                if (this.pendingRequest && this.pendingRequest.request === request) {
                  this.pendingRequest = undefined; // Clear pending request if we find the receipt
                }
                this.state = TxUtilsState.TX_MINED;
                this.lastMinedAtBlockNumber = receipt.blockNumber;
                return receipt;
              }
            } catch (err) {
              if (err instanceof Error && err.message.includes('reverted')) {
                throw formatViemError(err);
              }
            }
          }
          // If the nonce has changed but we cannot find the receipt, it means the transaction was replaced by another transaction
          // not sent as part of this monitoring process, so we throw an error, since the original request could not be fulfilled.
          throw new ReplacedL1TxError(
            `L1 transaction ${currentTxHash} was replaced by a different tx with nonce ${currentNonce}.`,
            currentNonce,
          );
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
          this.logger?.debug(`L1 transaction ${currentTxHash} still pending after ${timePassed}ms`);

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
            `L1 transaction ${currentTxHash} appears stuck after ${timePassed}ms. Attempting speed-up ${attempts}/${gasConfig.maxAttempts} ` +
              `with new priority fee ${formatGwei(newGasPrice.maxPriorityFeePerGas)} gwei`,
            {
              maxFeePerGas: formatGwei(newGasPrice.maxFeePerGas),
              maxPriorityFeePerGas: formatGwei(newGasPrice.maxPriorityFeePerGas),
              ...(newGasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(newGasPrice.maxFeePerBlobGas) }),
            },
          );

          const txData: PrepareTransactionRequestRequest = {
            ...request,
            ...blobInputs,
            nonce,
            gas: params.gasLimit,
            maxFeePerGas: newGasPrice.maxFeePerGas,
            maxPriorityFeePerGas: newGasPrice.maxPriorityFeePerGas,
          };
          if (isBlobTx && newGasPrice.maxFeePerBlobGas) {
            (txData as any).maxFeePerBlobGas = newGasPrice.maxFeePerBlobGas;
          }
          const signedRequest = await this.prepareSignedTransaction(txData);
          const newHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });
          if (!isCancelTx) {
            this.state = TxUtilsState.TX_SPEED_UP_SENT;
          }

          if (this.pendingRequest && this.pendingRequest.request === request) {
            this.pendingRequest.txHash = newHash;
            this.pendingRequest.attempts = attempts;
            this.pendingRequest.gasPrice = newGasPrice;
          }

          const cleanGasConfig = pickBy(gasConfig, (_, key) => key in l1TxUtilsConfigMappings);
          this.logger?.verbose(`Sent L1 speed-up tx ${newHash}, replacing ${currentTxHash}`, {
            gasLimit: params.gasLimit,
            maxFeePerGas: formatGwei(newGasPrice.maxFeePerGas),
            maxPriorityFeePerGas: formatGwei(newGasPrice.maxPriorityFeePerGas),
            gasConfig: cleanGasConfig,
            ...(newGasPrice.maxFeePerBlobGas && { maxFeePerBlobGas: formatGwei(newGasPrice.maxFeePerBlobGas) }),
          });

          currentTxHash = newHash;

          allVersions.add(currentTxHash);
          lastAttemptSent = this.dateProvider.now();
        }
        await sleep(gasConfig.checkIntervalMs!);
      } catch (err: any) {
        if (err instanceof ReplacedL1TxError) {
          this.logger?.debug(`L1 transaction ${currentTxHash} replaced by a different tx with nonce ${err.nonce}`);
          throw err;
        }
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
      this.state = TxUtilsState.TX_NOT_MINED;
    } else if (gasConfig.cancelTxOnTimeout) {
      // Fire cancellation without awaiting to avoid blocking the main thread
      this.attemptTxCancellation(currentTxHash, nonce, allVersions, isBlobTx, lastGasPrice, attempts).catch(err => {
        if (!(err instanceof ReplacedL1TxError)) {
          const viemError = formatViemError(err);
          this.logger?.error(`Failed to send cancellation for timed out tx ${currentTxHash}:`, viemError.message, {
            metaMessages: viemError.metaMessages,
          });
        }
      });
    }

    this.logger?.error(`L1 transaction ${currentTxHash} timed out`, undefined, {
      txHash: currentTxHash,
      txTimeoutAt: gasConfig.txTimeoutAt,
      txTimeoutMs: gasConfig.txTimeoutMs,
      txInitialTime: initialTxTime,
      now: this.dateProvider.now(),
      attempts,
      isInterrupted: this.interrupted,
      ...tx,
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
    gasConfig?: L1TxConfig,
    blobInputs?: L1BlobInputs,
  ): Promise<{ receipt: TransactionReceipt; gasPrice: GasPrice }> {
    const { txHash, gasLimit, gasPrice } = await this.sendTransaction(request, gasConfig, blobInputs);
    const receipt = await this.monitorTransaction(request, txHash, new Set(), { gasLimit }, gasConfig, blobInputs);
    return { receipt, gasPrice };
  }

  public override async simulate(
    request: L1TxRequest & { gas?: bigint; from?: Hex },
    _blockOverrides: BlockOverrides<bigint, number> = {},
    stateOverrides: StateOverride = [],
    abi: Abi = RollupAbi,
    txOpts?: L1TxUtilsConfig & { fallbackGasEstimate?: bigint; ignoreBlockGasLimit?: boolean },
  ): Promise<{ gasUsed: bigint; result: `0x${string}` }> {
    const blockOverrides = { ..._blockOverrides };
    const gasConfig = { ...this.config, ...txOpts };
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
   * @param nonce - The nonce of the transaction to cancel
   * @param allVersions - Hashes of all transactions submitted under the same nonce (any of them could mine)
   * @param previousGasPrice - The gas price of the previous transaction
   * @param attempts - The number of attempts to cancel the transaction
   * @returns The hash of the cancellation transaction
   */
  protected async attemptTxCancellation(
    currentTxHash: Hex,
    nonce: number,
    allVersions: Set<Hex>,
    isBlobTx = false,
    previousGasPrice?: GasPrice,
    attempts = 0,
  ) {
    if (isBlobTx) {
      throw new Error('Cannot cancel blob transactions (use L1TxUtilsWithBlobs)');
    }

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

    this.logger?.info(`Attempting to cancel L1 transaction ${currentTxHash} with nonce ${nonce}`, {
      maxFeePerGas: formatGwei(cancelGasPrice.maxFeePerGas),
      maxPriorityFeePerGas: formatGwei(cancelGasPrice.maxPriorityFeePerGas),
    });
    const request = {
      to: this.getSenderAddress().toString(),
      value: 0n,
    };

    // Send 0-value tx to self with higher gas price
    const txData = {
      ...request,
      nonce,
      gas: 21_000n, // Standard ETH transfer gas
      maxFeePerGas: cancelGasPrice.maxFeePerGas,
      maxPriorityFeePerGas: cancelGasPrice.maxPriorityFeePerGas,
    };
    const signedRequest = await this.prepareSignedTransaction(txData);
    const cancelTxHash = await this.client.sendRawTransaction({ serializedTransaction: signedRequest });

    this.pendingRequest = {
      request,
      attempts: attempts + 1,
      nonce,
      gasPrice: cancelGasPrice,
      txHash: cancelTxHash,
    };

    this.state = TxUtilsState.TX_CANCEL_SENT;

    this.logger?.info(`Sent cancellation tx ${cancelTxHash} for timed out tx ${currentTxHash}`, { nonce });

    const receipt = await this.monitorTransaction(
      request,
      cancelTxHash,
      allVersions,
      { gasLimit: 21_000n },
      undefined,
      undefined,
      true,
    );

    return receipt.transactionHash;
  }
}
