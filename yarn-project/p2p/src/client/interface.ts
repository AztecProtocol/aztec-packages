import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress, L2BlockId } from '@aztec/stdlib/block';
import type { ITxProvider, P2PClient } from '@aztec/stdlib/interfaces/server';
import type { BlockProposal, CheckpointAttestation, CheckpointProposal, TopicType } from '@aztec/stdlib/p2p';
import type { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import type { ENR } from '@nethermindeth/enr';

import type { P2PConfig } from '../config.js';
import type { AuthRequest, StatusMessage } from '../services/index.js';
import type { ReqRespSubProtocol, ReqRespSubProtocolHandler } from '../services/reqresp/interface.js';
import type {
  DuplicateAttestationInfo,
  DuplicateProposalInfo,
  OversizedProposalInfo,
  P2PBlockReceivedCallback,
  P2PCheckpointAttestationCallback,
  P2PCheckpointReceivedCallback,
} from '../services/service.js';

/**
 * Enum defining the possible states of the p2p client.
 */
export enum P2PClientState {
  IDLE,
  SYNCHING,
  RUNNING,
  STOPPED,
}

/**
 * The synchronization status of the P2P client.
 */
export interface P2PSyncState {
  /**
   * The current state of the p2p client.
   */
  state: P2PClientState;
  /**
   * The block number that the p2p client is synced to.
   */
  syncedToL2Block: L2BlockId;
}

/**
 * Interface of a P2P client.
 **/
export type P2P = P2PClient & {
  /**
   * Broadcasts a block proposal to other peers.
   *
   * @param proposal - the block proposal
   */
  broadcastProposal(proposal: BlockProposal): Promise<void>;

  /**
   * Broadcasts a checkpoint proposal (last block in a checkpoint) to other peers.
   *
   * @param proposal - the checkpoint proposal
   */
  broadcastCheckpointProposal(proposal: CheckpointProposal): Promise<void>;

  /** Broadcasts checkpoint attestations to other peers. */
  broadcastCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void>;

  /**
   * Registers a callback from the validator client that determines how to behave when
   * foreign block proposals are received
   *
   * @param handler - A function taking a received block proposal and producing an attestation
   */
  // REVIEW: https://github.com/AztecProtocol/aztec-packages/issues/7963
  // ^ This pattern is not my favorite (md)
  registerBlockProposalHandler(callback: P2PBlockReceivedCallback): void;

  /**
   * Registers a callback from the validator client that determines how to behave when
   * foreign checkpoint proposals are received
   *
   * @param handler - A function taking a received checkpoint proposal and producing attestations
   */
  registerValidatorCheckpointProposalHandler(callback: P2PCheckpointReceivedCallback): void;

  /**
   * Registers a callback that runs for ALL nodes (not just validators) when a checkpoint proposal is received.
   * Used to set the proposed checkpoint number on the archiver so the sequencer can build on top of it.
   *
   * @param handler - A function taking a received checkpoint proposal
   */
  registerAllNodesCheckpointProposalHandler(callback: P2PCheckpointReceivedCallback): void;

  /**
   * Registers a callback invoked when a duplicate proposal is detected (equivocation).
   * The callback is triggered on the first duplicate (when count goes from 1 to 2).
   *
   * @param callback - Function called with info about the duplicate proposal
   */
  registerDuplicateProposalCallback(callback: (info: DuplicateProposalInfo) => void): void;

  /**
   * Registers a callback invoked when an oversized block proposal (index at or beyond the consensus
   * per-checkpoint block limit) is stored and re-broadcast as slashing evidence.
   *
   * @param callback - Function called with info about the oversized proposal
   */
  registerOversizedProposalCallback(callback: (info: OversizedProposalInfo) => void): void;

  /**
   * Registers a callback invoked when a duplicate attestation is detected (equivocation).
   * A validator signing attestations for different proposals at the same slot.
   * The callback is triggered on the first duplicate (when count goes from 1 to 2).
   *
   * @param callback - Function called with info about the duplicate attestation
   */
  registerDuplicateAttestationCallback(callback: (info: DuplicateAttestationInfo) => void): void;

  /** Registers a callback invoked when a valid checkpoint attestation is accepted into the pool. */
  registerCheckpointAttestationCallback(callback: P2PCheckpointAttestationCallback): void;

  /**
   * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
   * @param tx - The transaction.
   **/
  sendTx(tx: Tx): Promise<void>;

  /**
   * Handles failed transaction execution by removing txs from the pool.
   * @param txHashes - Hashes of the transactions that failed execution.
   **/
  handleFailedExecution(txHashes: TxHash[]): Promise<void>;

  /**
   * Returns a transaction in the transaction pool by its hash.
   * @param txHash  - Hash of tx to return.
   * @param opts - Set `includeProof: false` to skip loading the tx proof from the DB.
   * @returns A single tx or undefined.
   */
  getTxByHashFromPool(txHash: TxHash, opts?: { includeProof?: boolean }): Promise<Tx | undefined>;

  /**
   * Returns transactions in the transaction pool by hash.
   * @param txHashes  - Hashes of txs to return.
   * @param opts - Set `includeProof: false` to skip loading tx proofs from the DB.
   * @returns An array of txs or undefined.
   */
  getTxsByHashFromPool(txHashes: TxHash[], opts?: { includeProof?: boolean }): Promise<(Tx | undefined)[]>;

  /**
   * Checks if transactions exist in the pool
   * @param txHashes - The hashes of the transactions to check for
   * @returns True or False for each hash
   */
  hasTxsInPool(txHashes: TxHash[]): Promise<boolean[]>;

  /**
   * Returns an archived transaction from the transaction pool by its hash.
   * @param txHash  - Hash of tx to return.
   * @returns A single tx or undefined.
   */
  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Returns whether the given tx hash is flagged as pending, mined, or deleted.
   * @param txHash - Hash of the tx to query.
   * @returns Pending, mined, or deleted depending on its status, or undefined if not found.
   */
  getTxStatus(txHash: TxHash): Promise<'pending' | 'mined' | 'deleted' | undefined>;

  /**
   * Returns an iterator over pending txs on the mempool.
   * Set `includeProof: false` to skip loading tx proofs from the DB.
   */
  iteratePendingTxs(opts?: { includeProof?: boolean }): AsyncIterableIterator<Tx>;

  /**
   * Returns an iterator over pending txs that have been in the pool long enough to be eligible for block building.
   * Set `includeProof: false` to skip loading tx proofs from the DB.
   */
  iterateEligiblePendingTxs(opts?: { includeProof?: boolean }): AsyncIterableIterator<Tx>;

  /** Returns the number of pending txs in the mempool. */
  getPendingTxCount(): Promise<number>;

  /**
   * Returns whether at least `minCount` pending txs have been in the pool long enough to be eligible for block
   * building. Early-exits once the threshold is met instead of counting every eligible tx.
   */
  hasEligiblePendingTxs(minCount: number): Promise<boolean>;

  /**
   * Protects existing transactions by hash for a given slot.
   * Returns hashes of transactions that weren't found in the pool.
   * @param txHashes - Hashes of the transactions to protect.
   * @param blockHeader - The block header providing slot context.
   * @returns Hashes of transactions not found in the pool.
   */
  protectTxs(txHashes: TxHash[], blockHeader: BlockHeader): Promise<TxHash[]>;

  /**
   * Prepares the pool for a new slot.
   * Unprotects transactions from earlier slots and validates them before
   * returning to pending state.
   * @param slotNumber - The slot number to prepare for
   */
  prepareForSlot(slotNumber: SlotNumber): Promise<void>;

  /**
   * Starts the p2p client.
   * @returns A promise signalling the completion of the block sync.
   */
  start(): Promise<void>;

  /**
   * Stops the p2p client.
   * @returns A promise signalling the completion of the stop process.
   */
  stop(): Promise<void>;

  /**
   * Indicates if the p2p client is ready for transaction submission.
   * @returns A boolean flag indicating readiness.
   */
  isReady(): boolean;

  /**
   * Returns the current status of the p2p client.
   */
  getStatus(): Promise<P2PSyncState>;

  /**
   * Returns the ENR of this node, if any.
   */
  getEnr(): ENR | undefined;

  /** Identifies a p2p client. */
  isP2PClient(): true;

  /** Returns the tx provider used for fetching transactions. */
  getTxProvider(): ITxProvider;

  updateP2PConfig(config: Partial<P2PConfig>): Promise<void>;

  /** Validates a set of txs received in a block proposal. */
  validateTxsReceivedInBlockProposal(txs: Tx[]): Promise<void>;

  /** Clears the db. */
  clear(): Promise<void>;

  addReqRespSubProtocol(subProtocol: ReqRespSubProtocol, handler: ReqRespSubProtocolHandler): Promise<void>;

  handleAuthRequestFromPeer(authRequest: AuthRequest, peerId: PeerId): Promise<StatusMessage>;

  /** Checks if any block proposals exist for the given slot. */
  hasBlockProposalsForSlot(slot: SlotNumber): Promise<boolean>;

  /** If node running this P2P stack is validator, passes in validator address to P2P layer */
  registerThisValidatorAddresses(address: EthAddress[]): void;

  /** Returns the number of peers in the GossipSub mesh for a given topic type. */
  getGossipMeshPeerCount(topicType: TopicType): Promise<number>;
};
