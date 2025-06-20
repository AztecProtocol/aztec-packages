import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import type { L2Block } from '@aztec/stdlib/block';
import { type L1RollupConstants, getEpochAtSlot, getTimestampRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

import type { TxPool } from '../../mem_pools/index.js';
import type { ReqRespInterface } from '../reqresp/interface.js';

export interface TxSource {
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;
}

export class TxCollectionService {
  private missingTxs: Map<string, { blockNumber: number; deadline: Date; readyForReqResp: boolean }> = new Map();

  private requests: Set<{ blockProposal?: BlockProposal; txHashes: Set<string>; deadline: Date }> = new Set();

  // We run a loop for each node, continuously collecting missing transactions
  private nodesSlowCollectionLoops: RunningPromise[];

  // And another loop for reqresp, which will run in parallel with the node loops
  private reqrespSlowCollectionLoop: RunningPromise;

  constructor(
    private reqResp: ReqRespInterface,
    private nodes: TxSource[],
    private constants: L1RollupConstants,
    private txPool: TxPool,
    private config: {
      txCollectionFastNodesTimeoutBeforeReqRespMs: number; // How long to wait before starting reqresp for fast collection
      txCollectionSlowNodesIntervalMs: number; // How often to collect from nodes
    },
    private dateProvider: DateProvider = new DateProvider(),
    private log: Logger = createLogger('p2p:tx_collection_service'),
  ) {
    this.nodesSlowCollectionLoops = this.nodes.map(
      node =>
        new RunningPromise(
          () => this.collectMissingTxsFromNode(node),
          this.log,
          this.config.txCollectionSlowNodesIntervalMs,
        ),
    );

    this.reqrespSlowCollectionLoop = new RunningPromise(() => this.collectMissingTxsViaReqResp(), this.log, 5000);
  }

  public async start() {
    this.nodesSlowCollectionLoops.forEach(loop => loop.start());
    const initialTxs = await this.loadMissingTxs();
    // Add initial txs to missingTxs
  }

  private async collectMissingTxsFromNode(node: TxSource) {
    const missingTxs = this.getMissingTxsForSlowCollection();
    const retrievedTxs = await this.getTxsFromNode(node, missingTxs.map(TxHash.fromString));
    const retrievedTxHashes = await Promise.all(retrievedTxs.map(tx => tx.getTxHash()));

    retrievedTxHashes.forEach(hash => this.missingTxs.delete(hash.toString()));
    retrievedTxHashes.forEach(hash => this.requests.forEach(req => req.txHashes.delete(hash.toString())));

    // Flag ALL the missingTxs we didnt get back here as ready for reqresp

    await this.txPool.addTxs(retrievedTxs);
  }

  private async getTxsFromNode(node: TxSource, txHashes: TxHash[]): Promise<Tx[]> {
    const response = await node.getTxsByHash(txHashes);
    return response.filter(tx => tx !== undefined);
  }

  private async collectMissingTxsViaReqResp() {
    const missingTxs = this.getMissingTxsForSlowCollection({ onlyReqRespReady: true });
    if (missingTxs.length === 0) {
      return;
    }

    // Send a batch request via reqresp for the missing txs
    // Use a non-aggressive config here
    await this.reqResp.sendBatchRequest(missingTxs, { deadline: undefined }); // Take your time, really
  }

  public stop() {
    // Stop
  }

  // To be called by p2pclient on each new mined block
  public startCollecting(block: L2Block, txHashes: TxHash[]) {
    for (const txHash of txHashes) {
      this.missingTxs.set(txHash.toString(), {
        blockNumber: block.number,
        deadline: this.getDeadlineForSlot(block.header.getSlot()),
        readyForReqResp: !this.hasNodes(), // If we have no nodes, we can start reqresp immediately
      });
    }
  }

  public async collectFast(proposal: BlockProposal, txHashes: TxHash[], opts: { deadline: Date }) {
    // Store this request so we can track it
    const { deadline } = opts;
    const request = { blockProposal: proposal, txHashes: new Set(txHashes), deadline };
    this.requests.add(request);

    // Start blasting all nodes for the txs
    await Promise.race([
      this.collectFromNodes(request.txHashes, { proposal, deadline }),
      sleep(this.config.txCollectionFastNodesTimeoutBeforeReqRespMs),
    ]);

    // After a bit, we start reqresp. Note we do not wait for all nodes to respond, since they may be slow.
    // We will keep blasting nodes while we run reqresp in parallel.
    // Use a very aggressive config here
    await this.reqResp.sendBatchRequest(request.txHashes, {
      deadline: request.deadline,
      pinned: proposal.getP2PSender(),
    });

    this.requests.delete(request);

    // Should we return the txs we found? Or throw if we couldnt satisfy the request?
  }

  private async collectFromNodes(mutableTxHashes: Set<string>, opts: { proposal?: BlockProposal; deadline: Date }) {
    if (!this.hasNodes()) {
      return;
    }

    // Collect requested txs from all nodes in parallel, retrying every 1s (configurable!)
    const fastLoops = this.nodes.map(node =>
      new RunningPromise(
        async () => {
          const foundTxs = await this.getTxsFromNode(node, Array.from(mutableTxHashes).map(TxHash.fromString));
          const foundTxHashes = await Promise.all(foundTxs.map(tx => tx.getTxHash()));
          foundTxHashes.forEach(hash => mutableTxHashes.delete(hash.toString()));
          foundTxHashes.forEach(hash => this.missingTxs.delete(hash.toString()));

          if (mutableTxHashes.size === 0) {
            fastLoops.forEach(loop => void loop.stop());
            // Consider using an abortcontroller to halt pending requests on the fly?
            // Then return control to the caller immediately, we're done!
          }
        },
        this.log,
        1000,
      ).start(),
    );

    // Await for deadline or until we find all txs!
  }

  private getMissingTxsForSlowCollection(opts: { onlyReqRespReady?: boolean } = {}): string[] {
    const now = this.dateProvider.now();
    const expiredTxs = Array.from(this.missingTxs.entries()).filter(([_, value]) => +value.deadline < now);
    expiredTxs.forEach(([txHash]) => this.missingTxs.delete(txHash));

    const fastCollectionTxs: Set<string> = new Set(Array.from(this.requests.values()).flatMap(r => r.txHashes));
    // TODO: Filter based on opts.onlyReqRespReady
    return Array.from(this.missingTxs.keys()).filter(([txHash]) => !fastCollectionTxs.has(txHash));
  }

  // To be called by the mempool when a tx is added, so if we find a tx eg via gossip, we can remove it from the missing txs
  // Or call internally, when we find from a node or reqresp
  private handleTxFound(txHash: TxHash): void {
    this.missingTxs.delete(txHash.toString());
    this.requests.forEach(req => req.txHashes.delete(txHash.toString()));
  }

  // To be called by the p2p client when a block is proven or pruned
  private stopCollecting(blockNumbers: number[]): void {
    // Remove from missingtxs and requests using blocknumbers as filters
  }

  private reconcileMissingTxs(): void {
    // On a loop every minute or so, check against the mempool if missing txs are still missing, if not remove them
    // Do we really need this?
  }

  private loadMissingTxs() {
    // Gather all mined tx hashes from the mempool and subtract the ones we know about
    // Use this to initialize the missingTxs map on start
  }

  private getDeadlineForSlot(slotNumber: bigint): Date {
    const epoch = getEpochAtSlot(slotNumber, this.constants);
    const submissionEndEpoch = epoch + BigInt(this.constants.proofSubmissionEpochs);
    const submissionEndTimestamp = getTimestampRangeForEpoch(submissionEndEpoch, this.constants)[1];
    return new Date(Number(submissionEndTimestamp) * 1000);
  }

  private hasNodes(): boolean {
    return this.nodes.length > 0;
  }
}
