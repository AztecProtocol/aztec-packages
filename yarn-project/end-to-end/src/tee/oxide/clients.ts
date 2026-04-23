import type { Fr } from '@aztec/foundation/curves/bn254';

// Minimal chain-facing surface the TEE depends on. Integration wiring uses
// the viem (L1) + AztecNode (L2) adapters; in-memory doubles for unit tests
// live alongside the tests. Keep this file to interfaces / shared types only
// so integration clients implement exactly what the TEE actually reads, with
// no test-double drift.

// Height of each L1 Inbox checkpoint subtree (`Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT`).
// Inbox emits `MessageSent(checkpointNumber, index, hash, rollingHash)`; the
// TEE reconstructs the checkpoint's sibling path from those events and
// verifies against `Inbox.getRoot(checkpointNumber)`. Checking on L1 (not
// against an L2-node-asserted root) is deliberate: the whole point of the
// TEE signing only over L1-verifiable state is that an untrusted L2 node
// cannot forge inbox inclusion.
export const INBOX_TREE_HEIGHT = 10;

export type L1FinalizedBlock = {
  number: bigint;
  hash: Buffer;
};

// Pinned view of L1 state at a specific block. Both `breakfast` and
// `evening` call `L1Client.freezeFinalized()` once and route every
// finalized-root / registry read through the returned snapshot so the
// witness checks and any block-hash binding all reference the same point
// in time. Implementations bind `blockNumber` and `blockHash` at
// construction; the read methods do not take a block argument.
export interface L1Snapshot {
  readonly number: bigint;
  readonly hash: Buffer;
  getInboxRoot(checkpointNumber: bigint): Promise<Buffer>;
  getOutboxRoot(epochNumber: bigint): Promise<Buffer>;
  isRegisteredTee(address: Buffer): Promise<boolean>;
}

export interface L1Client {
  // Returns a snapshot pinned to the L1 finalized block. Phase code uses
  // this so all finalized L1 reads agree on the same view.
  freezeFinalized(): Promise<L1Snapshot>;
  // Best-effort latest-state preflight used to skip re-signing a withdrawal
  // digest the TEEPortal has already consumed. This is not part of the finalized
  // attestation safety boundary.
  isWithdrawalSpent(withdrawalDigest: Buffer): Promise<boolean>;
}

// Public log emitted by the L2 bridge at withdrawal-init time, binding the
// approved note set / exit set into a tx-observable commitment the TEE can
// cross-check against its own digest inputs.
export type OxideBinding = {
  notesHash: Fr;
  exitsHash: Fr;
};

export type L2TxEffect = {
  blockHash: Fr;
  nullifiers: Fr[];
  notes: Fr[];
  oxideBindings: OxideBinding[];
};

export interface L2Client {
  // Block hash used to pin the TEE digest. Reference policy is the latest
  // block the node exposes.
  getBlockHash(): Promise<Fr>;
  getTxEffect(txHash: Fr): Promise<L2TxEffect>;
  // True if `candidate` is an ancestor of (or equal to) `descendant` on the
  // canonical L2 chain.
  isAncestor(candidate: Fr, descendant: Fr): Promise<boolean>;
  // True if `nullifier` is already in the L2 nullifier tree at the node's
  // current view. `breakfast` uses this as an off-chain preflight to avoid
  // signing an obviously replayed deposit. It is not the primary safety
  // boundary if the canonical network already guarantees nullifier uniqueness
  // over time.
  hasNullifier(nullifier: Fr): Promise<boolean>;
}
