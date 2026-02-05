import type { Logger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import { BatchTxRequester } from '../reqresp/batch-tx-requester/batch_tx_requester.js';
import type { BatchTxRequesterConfig } from '../reqresp/batch-tx-requester/config.js';
import type { BatchTxRequesterLibP2PService } from '../reqresp/batch-tx-requester/interface.js';
import type { IBatchRequestTxValidator } from '../reqresp/batch-tx-requester/tx_validator.js';
import { type BlockTxsSource, ReqRespSubProtocol, chunkTxHashesRequest } from '../reqresp/index.js';

/**
 * Strategy interface for collecting missing transactions for a block or proposal.
 * Allows swapping between different tx collection implementations for benchmarking.
 */
export interface MissingTxsCollector {
  /**
   * Collect missing transactions for a block or proposal.
   * @param txHashes - The transaction hashes to collect
   * @param blockTxsSource - The block or proposal containing the transactions
   * @param pinnedPeer - Optional peer expected to have the transactions
   * @param timeoutMs - Timeout in milliseconds
   * @returns The collected transactions
   */
  collectTxs(
    txHashes: TxHash[],
    blockTxsSource: BlockTxsSource,
    pinnedPeer: PeerId | undefined,
    timeoutMs: number,
  ): Promise<Tx[]>;
}

/**
 * Collects transactions using the BatchTxRequester implementation.
 * This uses a smart/dumb peer strategy with parallel workers.
 */
export class BatchTxRequesterCollector implements MissingTxsCollector {
  constructor(
    private p2pService: BatchTxRequesterLibP2PService,
    private log: Logger,
    private dateProvider: DateProvider,
    private txValidator?: IBatchRequestTxValidator,
    private batchTxRequesterConfig?: Partial<BatchTxRequesterConfig>,
  ) {}

  async collectTxs(
    txHashes: TxHash[],
    blockTxsSource: BlockTxsSource,
    pinnedPeer: PeerId | undefined,
    timeoutMs: number,
  ): Promise<Tx[]> {
    const {
      batchTxRequesterSmartParallelWorkerCount: smartParallelWorkerCount,
      batchTxRequesterDumbParallelWorkerCount: dumbParallelWorkerCount,
      batchTxRequesterTxBatchSize: txBatchSize,
      batchTxRequesterBadPeerThreshold: badPeerThreshold,
    } = this.batchTxRequesterConfig ?? {};

    const batchRequester = new BatchTxRequester(
      txHashes,
      blockTxsSource,
      pinnedPeer,
      timeoutMs,
      this.p2pService,
      this.log,
      this.dateProvider,
      {
        smartParallelWorkerCount,
        dumbParallelWorkerCount,
        txBatchSize,
        badPeerThreshold,
        txValidator: this.txValidator,
      },
    );

    return await BatchTxRequester.collectAllTxs(batchRequester.run());
  }
}

const DEFAULT_MAX_PEERS = 10;
const DEFAULT_MAX_RETRY_ATTEMPTS = 3;

/**
 * Collects transactions using the sendBatchRequest implementation from ReqResp.
 * This is the original implementation that balances requests across peers.
 */
export class SendBatchRequestCollector implements MissingTxsCollector {
  constructor(
    private p2pService: BatchTxRequesterLibP2PService,
    private maxPeers: number = DEFAULT_MAX_PEERS,
    private maxRetryAttempts: number = DEFAULT_MAX_RETRY_ATTEMPTS,
  ) {}

  async collectTxs(
    txHashes: TxHash[],
    _blockTxsSource: BlockTxsSource,
    pinnedPeer: PeerId | undefined,
    timeoutMs: number,
  ): Promise<Tx[]> {
    const txs = await this.p2pService.reqResp.sendBatchRequest<ReqRespSubProtocol.TX>(
      ReqRespSubProtocol.TX,
      chunkTxHashesRequest(txHashes),
      pinnedPeer,
      timeoutMs,
      this.maxPeers,
      this.maxRetryAttempts,
    );

    return txs.flat();
  }
}
