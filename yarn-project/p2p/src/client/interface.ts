import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress, L2BlockId } from '@aztec/stdlib/block';
import type { P2PApiFull } from '@aztec/stdlib/interfaces/server';
import type { BlockProposal, CheckpointAttestation, CheckpointProposal, P2PClientType } from '@aztec/stdlib/p2p';
import type { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import type { ENR } from '@nethermindeth/enr';

import type { P2PConfig } from '../config.js';
import type { AuthRequest, StatusMessage } from '../services/index.js';
import type {
  ReqRespSubProtocol,
  ReqRespSubProtocolHandler,
  ReqRespSubProtocolValidators,
} from '../services/reqresp/interface.js';
import type {
  DuplicateAttestationInfo,
  DuplicateProposalInfo,
  P2PBlockReceivedCallback,
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
export type P2P<T extends P2PClientType = P2PClientType.Full> = P2PApiFull<T> & {
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
  registerCheckpointProposalHandler(callback: P2PCheckpointReceivedCallback): void;

  /**
   * Registers a callback invoked when a duplicate proposal is detected (equivocation).
   * The callback is triggered on the first duplicate (when count goes from 1 to 2).
   *
   * @param callback - Function called with info about the duplicate proposal
   */
  registerDuplicateProposalCallback(callback: (info: DuplicateProposalInfo) => void): void;

  /**
   * Registers a callback invoked when a duplicate attestation is detected (equivocation).
   * A validator signing attestations for different proposals at the same slot.
   * The callback is triggered on the first duplicate (when count goes from 1 to 2).
   *
   * @param callback - Function called with info about the duplicate attestation
   */
  registerDuplicateAttestationCallback(callback: (info: DuplicateAttestationInfo) => void): void;

  /**
   * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
   * @param tx - The transaction.
   **/
  sendTx(tx: Tx): Promise<void>;

  /**
   * Adds transactions to the pool. Does not send to peers or validate the tx.
   * @param txs - The transactions.
   * @returns The number of txs added to the pool. Note if the transaction already exists, it will not be added again.
   **/
  addTxsToPool(txs: Tx[]): Promise<number>;

  /**
   * Handles failed transaction execution by removing txs from the pool.
   * @param txHashes - Hashes of the transactions that failed execution.
   **/
  handleFailedExecution(txHashes: TxHash[]): Promise<void>;

  /**
   * Returns a transaction in the transaction pool by its hash.
   * @param txHash  - Hash of tx to return.
   * @returns A single tx or undefined.
   */
  getTxByHashFromPool(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Returns transactions in the transaction pool by hash.
   * @param txHashes  - Hashes of txs to return.
   * @returns An array of txs or undefined.
   */
  getTxsByHashFromPool(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;

  /**
   * Checks if transactions exist in the pool
   * @param txHashes - The hashes of the transactions to check for
   * @returns True or False for each hash
   */
  hasTxsInPool(txHashes: TxHash[]): Promise<boolean[]>;

  /**
   * Returns transactions in the transaction pool by hash, requesting from the network if not found.
   * @param txHashes  - Hashes of tx to return.
   * @param pinnedPeerId - An optional peer id that will be used to request the tx from (in addition to other random peers).
   * @returns An array of tx or undefined.
   */
  getTxsByHash(txHashes: TxHash[], pinnedPeerId: PeerId | undefined): Promise<(Tx | undefined)[]>;

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

  /** Returns an iterator over pending txs on the mempool. */
  iteratePendingTxs(): AsyncIterableIterator<Tx>;

  /** Returns an iterator over pending txs that have been in the pool long enough to be eligible for block building. */
  iterateEligiblePendingTxs(): AsyncIterableIterator<Tx>;

  /** Returns the number of pending txs in the mempool. */
  getPendingTxCount(): Promise<number>;

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

  updateP2PConfig(config: Partial<P2PConfig>): Promise<void>;

  /** Validates a set of txs. */
  validate(txs: Tx[]): Promise<void>;

  /** Clears the db. */
  clear(): Promise<void>;

  addReqRespSubProtocol(
    subProtocol: ReqRespSubProtocol,
    handler: ReqRespSubProtocolHandler,
    validator?: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void>;

  handleAuthRequestFromPeer(authRequest: AuthRequest, peerId: PeerId): Promise<StatusMessage>;

  /** If node running this P2P stack is validator, passes in validator address to P2P layer */
  registerThisValidatorAddresses(address: EthAddress[]): void;
};
