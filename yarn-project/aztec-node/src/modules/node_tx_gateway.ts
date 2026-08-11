import type { CheckpointProposalHash, SlotNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import type { P2P } from '@aztec/p2p';
import { GasFees } from '@aztec/stdlib/gas';
import type {
  AztecNodeAdminConfig,
  GetTxByHashOptions,
  PeerInfo,
  ProposalsForSlot,
} from '@aztec/stdlib/interfaces/client';
import type { CheckpointAttestation } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

/**
 * Everything an `AztecNodeService` needs from whatever holds the transactions that are not in a block yet,
 * along with the peer-facing queries that come with it. A full node backs this with its `P2PClient` (a local
 * mempool fed by gossip); a follower node backs it with an RPC client to the upstream node it replicates from.
 *
 * Extracted so the node depends on this contract instead of on `P2P` directly, and so a follower node does not
 * have to construct a `P2PClient` (with its listen sockets, pools and stores) just to answer tx queries.
 */
export interface NodeTxGateway {
  /**
   * Whether the node must validate a tx itself before handing it to {@link sendTx}. Always true for the
   * p2p-backed gateway, whose mempool accepts whatever it is given. Configurable on the upstream-backed
   * gateway, where validation only shields the upstream and fails the client faster — the upstream re-validates
   * whatever is forwarded to it either way — so a follower may be run as a pure relay instead.
   */
  readonly requiresLocalTxValidation: boolean;

  /** Submits a tx for inclusion, either into the local mempool or to the upstream node. */
  sendTx(tx: Tx): Promise<void>;

  /** Returns txs awaiting inclusion, oldest first. */
  getPendingTxs(limit?: number, after?: TxHash, options?: GetTxByHashOptions): Promise<Tx[]>;

  /** Returns the number of txs awaiting inclusion. */
  getPendingTxCount(): Promise<number>;

  /** Returns a tx that has not been mined yet (or was mined recently enough to still be held), if known. */
  getTxByHash(txHash: TxHash, options?: GetTxByHashOptions): Promise<Tx | undefined>;

  /** Batched {@link getTxByHash}. Unknown hashes are omitted from the result. */
  getTxsByHash(txHashes: TxHash[], options?: GetTxByHashOptions): Promise<Tx[]>;

  /**
   * Whether a tx that the local archiver has no effect for is still known to the gateway. Drives the
   * pending-versus-dropped decision when building a receipt.
   */
  hasUnminedTx(txHash: TxHash): Promise<boolean>;

  /** Returns the highest priority fees the node is willing to advertise, based on the txs awaiting inclusion. */
  getMaxPriorityFees(): Promise<GasFees>;

  /** Returns the peers this node is connected to. Empty when the node has no p2p stack. */
  getPeers(includePending?: boolean): Promise<PeerInfo[]>;

  /** Returns this node's own ENR, if it has one. */
  getEncodedEnr(): Promise<string | undefined>;

  /** Returns the checkpoint attestations collected for a slot. Empty when the node has no p2p stack. */
  getCheckpointAttestationsForSlot(
    slot: SlotNumber,
    proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]>;

  /** Returns the proposals retained for a slot. Empty when the node has no p2p stack. */
  getProposalsForSlot(slot: SlotNumber): Promise<ProposalsForSlot>;

  /** Applies a runtime config update to the underlying tx source. */
  updateConfig(config: Partial<AztecNodeAdminConfig>): Promise<void>;

  /** Drops any locally held tx state. No-op when the txs live upstream. */
  clear(): Promise<void>;

  /** Stops the underlying tx source, if the gateway owns one. */
  stop(): Promise<void>;
}

/** Empty result returned for proposal queries by gateways with no attestation pool of their own. */
export const NO_PROPOSALS_FOR_SLOT: ProposalsForSlot = { blockProposals: [], checkpointProposals: [] };

/** Backs a node's tx surface with its own `P2PClient`: a local mempool fed by (and feeding) gossip. */
export class P2PTxGateway implements NodeTxGateway {
  public readonly requiresLocalTxValidation = true;

  constructor(private readonly p2pClient: P2P) {}

  public sendTx(tx: Tx): Promise<void> {
    return this.p2pClient.sendTx(tx);
  }

  public getPendingTxs(limit?: number, after?: TxHash, options?: GetTxByHashOptions): Promise<Tx[]> {
    return this.p2pClient.getPendingTxs(limit, after, options);
  }

  public getPendingTxCount(): Promise<number> {
    return this.p2pClient.getPendingTxCount();
  }

  public getTxByHash(txHash: TxHash, options?: GetTxByHashOptions): Promise<Tx | undefined> {
    return this.p2pClient.getTxByHashFromPool(txHash, { includeProof: !!options?.includeProof });
  }

  public async getTxsByHash(txHashes: TxHash[], options?: GetTxByHashOptions): Promise<Tx[]> {
    const txs = await this.p2pClient.getTxsByHashFromPool(txHashes, { includeProof: !!options?.includeProof });
    return compactArray(txs);
  }

  /**
   * A tx flagged as mined by the pool but missing from the archiver means the archiver pruned the block it was
   * mined in and the pool has not caught up yet, so it is reported as still known.
   */
  public async hasUnminedTx(txHash: TxHash): Promise<boolean> {
    const status = await this.p2pClient.getTxStatus(txHash);
    return status === 'pending' || status === 'mined';
  }

  public async getMaxPriorityFees(): Promise<GasFees> {
    for await (const tx of this.p2pClient.iteratePendingTxs({ includeProof: false })) {
      return tx.getGasSettings().maxPriorityFeesPerGas;
    }
    return GasFees.from({ feePerDaGas: 0n, feePerL2Gas: 0n });
  }

  public getPeers(includePending?: boolean): Promise<PeerInfo[]> {
    return this.p2pClient.getPeers(includePending);
  }

  public getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve(this.p2pClient.getEnr()?.encodeTxt());
  }

  public getCheckpointAttestationsForSlot(
    slot: SlotNumber,
    proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]> {
    return this.p2pClient.getCheckpointAttestationsForSlot(slot, proposalPayloadHash);
  }

  public getProposalsForSlot(slot: SlotNumber): Promise<ProposalsForSlot> {
    return this.p2pClient.getProposalsForSlot(slot);
  }

  public updateConfig(config: Partial<AztecNodeAdminConfig>): Promise<void> {
    return this.p2pClient.updateP2PConfig(config);
  }

  public clear(): Promise<void> {
    return this.p2pClient.clear();
  }

  public stop(): Promise<void> {
    return this.p2pClient.stop();
  }
}
