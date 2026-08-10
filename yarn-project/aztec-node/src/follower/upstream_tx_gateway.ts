import type { CheckpointProposalHash, SlotNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { GasFees } from '@aztec/stdlib/gas';
import type {
  AztecNode,
  AztecNodeAdminConfig,
  GetTxByHashOptions,
  PeerInfo,
  ProposalsForSlot,
} from '@aztec/stdlib/interfaces/client';
import type { CheckpointAttestation } from '@aztec/stdlib/p2p';
import { type Tx, type TxHash, TxStatus } from '@aztec/stdlib/tx';

import { NO_PROPOSALS_FOR_SLOT, type NodeTxGateway } from '../modules/node_tx_gateway.js';

/**
 * Backs a follower node's tx surface with its upstream node: transactions are forwarded there verbatim and
 * every query about a not-yet-mined tx is answered by it, since a follower keeps no mempool of its own.
 *
 * The p2p-only queries (peers, ENR, attestations, proposals) report this node's own — empty — view rather than
 * the upstream's: a follower is not a peer of anyone and holds no attestations, and reporting the upstream's
 * would misrepresent which node the caller is talking to.
 */
export class UpstreamTxGateway implements NodeTxGateway {
  /** The upstream node validates every tx it is sent, so the follower does not duplicate the work. */
  public readonly requiresLocalTxValidation = false;

  constructor(
    private readonly upstream: AztecNode,
    private readonly log: Logger = createLogger('node:upstream-tx-gateway'),
  ) {}

  public async sendTx(tx: Tx): Promise<void> {
    const txHash = tx.getTxHash().toString();
    this.log.debug(`Forwarding tx ${txHash} to upstream node`, { txHash });
    await this.upstream.sendTx(tx);
  }

  public getPendingTxs(limit?: number, after?: TxHash, options?: GetTxByHashOptions): Promise<Tx[]> {
    return this.upstream.getPendingTxs(limit, after, options);
  }

  public getPendingTxCount(): Promise<number> {
    return this.upstream.getPendingTxCount();
  }

  public getTxByHash(txHash: TxHash, options?: GetTxByHashOptions): Promise<Tx | undefined> {
    return this.upstream.getTxByHash(txHash, options);
  }

  public getTxsByHash(txHashes: TxHash[], options?: GetTxByHashOptions): Promise<Tx[]> {
    return this.upstream.getTxsByHash(txHashes, options);
  }

  /**
   * A tx the upstream reports as mined counts as still known here: the follower has not replicated the block
   * that mined it yet, so the caller is told the tx is pending rather than being handed a block this node
   * cannot serve.
   */
  public async hasUnminedTx(txHash: TxHash): Promise<boolean> {
    const receipt = await this.upstream.getTxReceipt(txHash);
    return receipt.status !== TxStatus.DROPPED;
  }

  public getMaxPriorityFees(): Promise<GasFees> {
    return this.upstream.getMaxPriorityFees();
  }

  public getPeers(_includePending?: boolean): Promise<PeerInfo[]> {
    return Promise.resolve([]);
  }

  public getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  public getCheckpointAttestationsForSlot(
    _slot: SlotNumber,
    _proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]> {
    return Promise.resolve([]);
  }

  public getProposalsForSlot(_slot: SlotNumber): Promise<ProposalsForSlot> {
    return Promise.resolve(NO_PROPOSALS_FOR_SLOT);
  }

  /** No local tx state to reconfigure; the upstream node is configured by its own operator. */
  public updateConfig(_config: Partial<AztecNodeAdminConfig>): Promise<void> {
    return Promise.resolve();
  }

  /** No local tx state to drop. */
  public clear(): Promise<void> {
    return Promise.resolve();
  }

  /** The upstream client is stateless; nothing to stop. */
  public stop(): Promise<void> {
    return Promise.resolve();
  }
}
