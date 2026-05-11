import type { Branded } from './types.js';

/**
 * A branded `0x`-prefixed hex string representing a checkpoint proposal payload hash.
 *
 * A `CheckpointProposal` and the matching `CheckpointAttestation` sign the same
 * `ConsensusPayload`, so they share this hash type. Used by the p2p attestation
 * pool to dedup signed payloads and detect equivocations.
 */
export type CheckpointProposalHash = Branded<`0x${string}`, 'CheckpointProposalHash'>;

/** Brands a `0x`-prefixed hex string as a CheckpointProposalHash. */
export function CheckpointProposalHash(s: `0x${string}`): CheckpointProposalHash {
  return s as CheckpointProposalHash;
}

/** Constructs a CheckpointProposalHash from a raw 32-byte hash buffer. */
CheckpointProposalHash.fromBuffer = function (buf: Buffer): CheckpointProposalHash {
  return `0x${buf.toString('hex')}` as CheckpointProposalHash;
};

/**
 * A branded `0x`-prefixed hex string representing a block proposal payload hash.
 *
 * Used by the p2p attestation pool to dedup signed payloads at a given
 * `(slot, indexWithinCheckpoint)` and detect equivocations.
 */
export type BlockProposalHash = Branded<`0x${string}`, 'BlockProposalHash'>;

/** Brands a `0x`-prefixed hex string as a BlockProposalHash. */
export function BlockProposalHash(s: `0x${string}`): BlockProposalHash {
  return s as BlockProposalHash;
}

/** Constructs a BlockProposalHash from a raw 32-byte hash buffer. */
BlockProposalHash.fromBuffer = function (buf: Buffer): BlockProposalHash {
  return `0x${buf.toString('hex')}` as BlockProposalHash;
};
