import type { CheckpointProposalHash, SlotNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import type { BlockData, L2Block, L2BlockId } from '@aztec/stdlib/block';
import type { BlockProposal, CheckpointAttestation, CheckpointProposalCore } from '@aztec/stdlib/p2p';
import type { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';

import type { P2PConfig } from '../config.js';
import type {
  AttestationPoolApi,
  ProposalsForSlot,
  TryAddResult,
} from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { AddTxsResult, TxPoolV2 } from '../mem_pools/tx_pool_v2/interfaces.js';

/**
 * Internal collaborator that owns the tx pool and attestation pool on behalf of the P2P client.
 *
 * Encapsulates all reads/writes against the mempools, including the reactions to L2 block
 * stream events (mined, finalized, and pruned blocks) that keep pool state reconciled with
 * the chain.
 */
export class MempoolClient {
  private readonly txPool: TxPoolV2;
  private readonly attestationPool: AttestationPoolApi;

  constructor(
    mempools: MemPools,
    private readonly log = createLogger('p2p:mempool'),
  ) {
    this.txPool = mempools.txPool;
    this.attestationPool = mempools.attestationPool;
  }

  public async start(): Promise<void> {
    await this.txPool.start();
  }

  public async stop(): Promise<void> {
    await this.txPool.stop();
    this.log.debug('Stopped tx pool');
  }

  public async updateConfig(config: Partial<P2PConfig>): Promise<void> {
    await this.txPool.updateConfig(config);
  }

  /** Returns whether both the tx pool and the attestation pool are empty. */
  public async isEmpty(): Promise<boolean> {
    return (await this.txPool.isEmpty()) && (await this.attestationPool.isEmpty());
  }

  public async getPendingTxs(limit?: number, after?: TxHash): Promise<Tx[]> {
    let txHashes = await this.txPool.getPendingTxHashes();

    let startIndex = 0;
    if (after) {
      startIndex = txHashes.findIndex(txHash => after.equals(txHash));
      if (startIndex === -1) {
        return [];
      }
      startIndex++;
    }

    const endIndex = limit !== undefined ? startIndex + limit : undefined;
    txHashes = txHashes.slice(startIndex, endIndex);

    const maybeTxs = await Promise.all(txHashes.map(txHash => this.txPool.getTxByHash(txHash)));
    return maybeTxs.filter((tx): tx is Tx => !!tx);
  }

  public getPendingTxCount(): Promise<number> {
    return this.txPool.getPendingTxCount();
  }

  public async *iteratePendingTxs(): AsyncIterableIterator<Tx> {
    for (const txHash of await this.txPool.getPendingTxHashes()) {
      const tx = await this.txPool.getTxByHash(txHash);
      if (tx) {
        yield tx;
      }
    }
  }

  public async *iterateEligiblePendingTxs(): AsyncIterableIterator<Tx> {
    for (const txHash of await this.txPool.getEligiblePendingTxHashes()) {
      const tx = await this.txPool.getTxByHash(txHash);
      if (tx) {
        yield tx;
      }
    }
  }

  public getTxByHashFromPool(txHash: TxHash): Promise<Tx | undefined> {
    return this.txPool.getTxByHash(txHash);
  }

  public getTxsByHashFromPool(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.txPool.getTxsByHash(txHashes);
  }

  public hasTxsInPool(txHashes: TxHash[]): Promise<boolean[]> {
    return this.txPool.hasTxs(txHashes);
  }

  public getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.txPool.getArchivedTxByHash(txHash);
  }

  public addPendingTxs(txs: Tx[], opts?: { source?: string; feeComparisonOnly?: boolean }): Promise<AddTxsResult> {
    return this.txPool.addPendingTxs(txs, opts);
  }

  public async getTxStatus(txHash: TxHash): Promise<'pending' | 'mined' | 'deleted' | undefined> {
    const status = await this.txPool.getTxStatus(txHash);
    return status === 'protected' ? 'pending' : status;
  }

  public async handleFailedExecution(txHashes: TxHash[]): Promise<void> {
    await this.txPool.handleFailedExecution(txHashes);
  }

  public protectTxs(txHashes: TxHash[], blockHeader: BlockHeader): Promise<TxHash[]> {
    return this.txPool.protectTxs(txHashes, blockHeader);
  }

  public async prepareForSlot(slotNumber: SlotNumber): Promise<void> {
    await this.txPool.prepareForSlot(slotNumber);
  }

  public tryAddBlockProposal(proposal: BlockProposal): Promise<TryAddResult> {
    return this.attestationPool.tryAddBlockProposal(proposal);
  }

  public tryAddCheckpointProposal(proposal: CheckpointProposalCore): Promise<TryAddResult> {
    return this.attestationPool.tryAddCheckpointProposal(proposal);
  }

  public getCheckpointAttestationsForSlot(
    slot: SlotNumber,
    proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]> {
    return proposalPayloadHash
      ? this.attestationPool.getCheckpointAttestationsForSlotAndProposal(slot, proposalPayloadHash)
      : this.attestationPool.getCheckpointAttestationsForSlot(slot);
  }

  public addOwnCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    return this.attestationPool.addOwnCheckpointAttestations(attestations);
  }

  public getProposalsForSlot(slot: SlotNumber): Promise<ProposalsForSlot> {
    return this.attestationPool.getProposalsForSlot(slot);
  }

  public hasBlockProposalsForSlot(slot: SlotNumber): Promise<boolean> {
    return this.attestationPool.hasBlockProposalsForSlot(slot);
  }

  /**
   * Handles mined blocks by marking the txs in them as mined.
   * @param blocks - A list of existing blocks with txs that the P2P client needs to ensure the tx pool is reconciled with.
   */
  public async handleMinedBlocks(blocks: L2Block[]): Promise<void> {
    for (const block of blocks) {
      await this.txPool.handleMinedBlock(block);
    }
  }

  /**
   * Handles new finalized blocks by deleting the txs and attestations in them.
   * @param blocks - A list of finalized L2 blocks.
   */
  public async handleFinalizedBlocks(blocks: BlockData[]): Promise<void> {
    if (!blocks.length) {
      return;
    }

    // Finalization is monotonic, so we only need to call with the last block
    const lastBlock = blocks.at(-1)!;
    await this.txPool.handleFinalizedBlock(lastBlock.header);
    await this.attestationPool.deleteOlderThan(lastBlock.header.getSlot());
  }

  /**
   * Updates the tx pool after a chain prune.
   * @param latestBlock - The block ID the chain was pruned to.
   * @param opts.deleteAllTxs - Whether to delete all txs (set on epoch prunes), rather than just un-mining them.
   */
  public async handlePrunedBlocks(latestBlock: L2BlockId, opts: { deleteAllTxs: boolean }): Promise<void> {
    await this.txPool.handlePrunedBlocks(latestBlock, opts);
  }
}
