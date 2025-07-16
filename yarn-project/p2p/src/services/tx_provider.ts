import { compactArray } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import type { BlockInfo, L2Block } from '@aztec/stdlib/block';
import type { ITxProvider } from '@aztec/stdlib/interfaces/server';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { Tx, TxHash, type TxWithHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';

import type { P2PClient } from '../client/p2p_client.js';
import type { TxPool } from '../mem_pools/index.js';
import type { FastCollectionRequestInput, TxCollection } from './tx_collection/tx_collection.js';
import { TxProviderInstrumentation } from './tx_provider_instrumentation.js';

/**
 * Gathers and returns txs given a block proposal, block, or their hashes.
 * Loads available txs from the tx pool, and  relies on a TxCollection service to collect txs from the network and other nodes.
 */
export class TxProvider implements ITxProvider {
  protected instrumentation: TxProviderInstrumentation;

  constructor(
    private txCollection: TxCollection,
    private txPool: TxPool,
    private txValidator: Pick<P2PClient, 'validate'>,
    private log: Logger = createLogger('p2p:tx-collector'),
    client: TelemetryClient = getTelemetryClient(),
  ) {
    this.instrumentation = new TxProviderInstrumentation(client, 'TxProvider');
  }

  /** Returns txs from the tx pool given their hashes.*/
  public async getAvailableTxs(txHashes: TxHash[]): Promise<{ txs: TxWithHash[]; missingTxs: TxHash[] }> {
    const response = await this.txPool.getTxsByHash(txHashes);
    if (response.length !== txHashes.length) {
      throw new Error(`Unexpected response size from tx pool: expected ${txHashes.length} but got ${response.length}`);
    }
    const txs: TxWithHash[] = [];
    const missingTxs: TxHash[] = [];

    for (let i = 0; i < txHashes.length; i++) {
      const tx = response[i];
      if (tx === undefined) {
        missingTxs.push(txHashes[i]);
      } else {
        txs.push(tx.setTxHash(txHashes[i]));
      }
    }

    return { txs, missingTxs };
  }

  /** Gathers txs from the tx pool, proposal body, remote rpc nodes, and reqresp. */
  public getTxsForBlockProposal(
    blockProposal: BlockProposal,
    opts: { pinnedPeer: PeerId | undefined; deadline: Date },
  ): Promise<{ txs: TxWithHash[]; missingTxs: TxHash[] }> {
    return this.getOrderedTxsFromAllSources(
      { type: 'proposal', blockProposal },
      blockProposal.toBlockInfo(),
      blockProposal.txHashes,
      { ...opts, pinnedPeer: opts.pinnedPeer },
    );
  }

  /** Gathers txs from the tx pool, remote rpc nodes, and reqresp. */
  public getTxsForBlock(
    block: L2Block,
    opts: { deadline: Date },
  ): Promise<{ txs: TxWithHash[]; missingTxs: TxHash[] }> {
    return this.getOrderedTxsFromAllSources(
      { type: 'block', block },
      block.toBlockInfo(),
      block.body.txEffects.map(tx => tx.txHash),
      { ...opts, pinnedPeer: undefined },
    );
  }

  private async getOrderedTxsFromAllSources(
    request: FastCollectionRequestInput,
    blockInfo: BlockInfo,
    txHashes: TxHash[],
    opts: { pinnedPeer: PeerId | undefined; deadline: Date },
  ) {
    const [durationMs, result] = await elapsed(() => this.getTxsFromAllSources(request, blockInfo, txHashes, opts));
    const { missingTxHashes, txsFromMempool, txsFromNetwork, txsFromProposal } = result;

    const txs = [...(txsFromMempool ?? []), ...(txsFromProposal ?? []), ...(txsFromNetwork ?? [])];
    const missingTxs = missingTxHashes?.length ?? 0;

    const level = missingTxs === 0 ? 'verbose' : 'warn';
    this.log[level](`Retrieved ${txs.length} out of ${blockInfo.txCount} txs for ${request.type}`, {
      ...blockInfo,
      txsFromProposal: txsFromProposal?.length,
      txsFromMempool: txsFromMempool?.length,
      txsFromNetwork: txsFromNetwork?.length,
      missingTxs,
      durationMs,
    });

    const orderedTxs = this.orderTxs(txs, txHashes);
    if (orderedTxs.length + missingTxs !== txHashes.length) {
      throw new Error(
        `Error collecting txs for ${request.type} with ${txHashes.length} txs: found ${orderedTxs.length} and flagged ${missingTxs} as missing`,
      );
    }

    return { txs: orderedTxs, missingTxs: (missingTxHashes ?? []).map(TxHash.fromString), durationMs };
  }

  private orderTxs(txs: TxWithHash[], order: TxHash[]): TxWithHash[] {
    const txsMap = new Map(txs.map(tx => [tx.txHash.toString(), tx]));
    return order.map(hash => txsMap.get(hash.toString())!).filter(tx => tx !== undefined);
  }

  private async getTxsFromAllSources(
    request: FastCollectionRequestInput,
    blockInfo: BlockInfo,
    txHashes: TxHash[],
    opts: { pinnedPeer: PeerId | undefined; deadline: Date },
  ) {
    const missingTxHashes = new Set(txHashes.map(txHash => txHash.toString()));
    if (missingTxHashes.size === 0) {
      this.log.debug(`Received request with no transactions`, blockInfo);
      return {};
    }

    // First go to our tx pool and fetch whatever txs we have there
    // We go to the mempool first since those txs are already validated
    const txsFromMempool = await this.txPool.getTxsByHash(txHashes).then(txs => Tx.toTxsWithHashes(compactArray(txs)));
    txsFromMempool.forEach(tx => missingTxHashes.delete(tx.txHash.toString()));
    this.instrumentation.incTxsFromMempool(txsFromMempool.length);
    this.log.debug(
      `Retrieved ${txsFromMempool.length} txs from mempool for block proposal (${missingTxHashes.size} pending)`,
      { ...blockInfo, missingTxHashes: [...missingTxHashes] },
    );

    if (missingTxHashes.size === 0) {
      return { txsFromMempool };
    }

    // Take txs from the proposal body if there are any
    // Note that we still have to validate these txs, but we do it in parallel with tx collection
    const proposal = request.type === 'proposal' ? request.blockProposal : undefined;
    const txsFromProposal = await this.extractFromProposal(proposal, [...missingTxHashes]);
    if (txsFromProposal.length > 0) {
      this.instrumentation.incTxsFromProposals(txsFromProposal.length);
      txsFromProposal.forEach(tx => missingTxHashes.delete(tx.txHash.toString()));
      this.log.debug(`Retrieved ${txsFromProposal.length} txs from proposal body (${missingTxHashes.size} pending)`, {
        ...blockInfo,
        missingTxHashes: [...missingTxHashes],
      });
    }

    if (missingTxHashes.size === 0) {
      await this.processProposalTxs(txsFromProposal);
      return { txsFromMempool, txsFromProposal };
    }

    // Start tx collection from the network if needed, while we validate the txs taken from the proposal in parallel
    const [txsFromNetwork] = await Promise.all([
      this.txCollection.collectFastFor(request, [...missingTxHashes], opts),
      this.processProposalTxs(txsFromProposal),
    ] as const);

    if (txsFromNetwork.length > 0) {
      txsFromNetwork.forEach(tx => missingTxHashes.delete(tx.txHash.toString()));
      this.instrumentation.incTxsFromP2P(txsFromNetwork.length);
      this.log.debug(
        `Retrieved ${txsFromNetwork.length} txs from network for block proposal (${missingTxHashes.size} pending)`,
        { ...blockInfo, missingTxHashes: [...missingTxHashes] },
      );
    }

    if (missingTxHashes.size === 0) {
      return { txsFromNetwork, txsFromMempool, txsFromProposal };
    }

    // We are still missing txs, make one last attempt to collect them from our pool, in case they showed up somehow else
    const moreTxsFromPool = await this.txPool
      .getTxsByHash([...missingTxHashes].map(TxHash.fromString))
      .then(txs => Tx.toTxsWithHashes(compactArray(txs)));

    if (moreTxsFromPool.length > 0) {
      this.instrumentation.incTxsFromMempool(moreTxsFromPool.length);
      this.log.debug(
        `Retrieved ${moreTxsFromPool.length} txs from pool retry for block proposal (${missingTxHashes.size} pending)`,
        { ...blockInfo, missingTxHashes: [...missingTxHashes] },
      );
    }

    if (missingTxHashes.size > 0) {
      this.instrumentation.incMissingTxs(missingTxHashes.size);
    }

    return {
      txsFromNetwork,
      txsFromMempool: [...txsFromMempool, ...moreTxsFromPool],
      txsFromProposal,
      missingTxHashes: [...missingTxHashes],
    };
  }

  private async extractFromProposal(
    proposal: BlockProposal | undefined,
    missingTxHashes: string[],
  ): Promise<TxWithHash[]> {
    if (!proposal) {
      return [];
    }
    return (await Tx.toTxsWithHashes(compactArray(proposal.txs ?? []))).filter(tx =>
      missingTxHashes.includes(tx.txHash.toString()),
    );
  }

  private async processProposalTxs(txs: TxWithHash[]): Promise<void> {
    if (txs.length === 0) {
      return;
    }
    await this.txValidator.validate(txs);
    await this.txPool.addTxs(txs);
  }
}
