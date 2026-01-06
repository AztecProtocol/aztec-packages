import type { Logger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import { BatchTxRequester } from '../reqresp/batch-tx-requester/batch_tx_requester.js';
import type { BatchTxRequesterLibP2PService } from '../reqresp/batch-tx-requester/interface.js';
import { ReqRespSubProtocol } from '../reqresp/interface.js';
import { chunkTxHashesRequest } from '../reqresp/protocols/tx.js';

/**
 * Strategy interface for collecting transactions for block proposals.
 * Allows swapping between different tx collection implementations for benchmarking.
 */
export interface ProposalTxCollector {
  /**
   * Collect transactions for a block proposal.
   * @param txHashes - The transaction hashes to collect
   * @param blockProposal - The block proposal containing the transactions
   * @param pinnedPeer - Optional peer that sent the proposal (expected to have all txs)
   * @param timeoutMs - Timeout in milliseconds
   * @returns The collected transactions
   */
  collectTxs(
    txHashes: TxHash[],
    blockProposal: BlockProposal,
    pinnedPeer: PeerId | undefined,
    timeoutMs: number,
  ): Promise<Tx[]>;
}

/**
 * Collects transactions using the BatchTxRequester implementation.
 * This uses a smart/dumb peer strategy with parallel workers.
 */
export class BatchTxRequesterCollector implements ProposalTxCollector {
  constructor(
    private p2pService: BatchTxRequesterLibP2PService,
    private log: Logger,
    private dateProvider: DateProvider,
  ) {}

  async collectTxs(
    txHashes: TxHash[],
    blockProposal: BlockProposal,
    pinnedPeer: PeerId | undefined,
    timeoutMs: number,
  ): Promise<Tx[]> {
    const batchRequester = new BatchTxRequester(
      txHashes,
      blockProposal,
      pinnedPeer,
      timeoutMs,
      this.p2pService,
      this.log,
      this.dateProvider,
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
export class SendBatchRequestCollector implements ProposalTxCollector {
  constructor(
    private p2pService: BatchTxRequesterLibP2PService,
    private maxPeers: number = DEFAULT_MAX_PEERS,
    private maxRetryAttempts: number = DEFAULT_MAX_RETRY_ATTEMPTS,
  ) {}

  async collectTxs(
    txHashes: TxHash[],
    _blockProposal: BlockProposal,
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
