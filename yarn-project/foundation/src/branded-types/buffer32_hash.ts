import type { BaseBuffer32 } from '../buffer/buffer32.js';
import { Buffer32 } from '../buffer/buffer32.js';
import type { Branded } from './types.js';

/** A branded Buffer32 representing a block proposal hash, used for p2p deduplication. */
export type BlockProposalHash = Branded<BaseBuffer32, 'BlockProposalHash'>;

/** Creates a BlockProposalHash from a BaseBuffer32. */
export function BlockProposalHash(buf: BaseBuffer32): BlockProposalHash {
  return buf as BlockProposalHash;
}

/** Creates a BlockProposalHash from a raw Buffer. */
BlockProposalHash.fromBuffer = function (buf: Buffer): BlockProposalHash {
  return new Buffer32(buf) as unknown as BlockProposalHash;
};

/** A branded Buffer32 representing a checkpoint proposal hash, used for p2p deduplication. */
export type CheckpointProposalHash = Branded<BaseBuffer32, 'CheckpointProposalHash'>;

/** Creates a CheckpointProposalHash from a BaseBuffer32. */
export function CheckpointProposalHash(buf: BaseBuffer32): CheckpointProposalHash {
  return buf as CheckpointProposalHash;
}

/** Creates a CheckpointProposalHash from a raw Buffer. */
CheckpointProposalHash.fromBuffer = function (buf: Buffer): CheckpointProposalHash {
  return new Buffer32(buf) as unknown as CheckpointProposalHash;
};

/** A branded Buffer32 representing a checkpoint attestation hash, used for p2p deduplication. */
export type CheckpointAttestationHash = Branded<BaseBuffer32, 'CheckpointAttestationHash'>;

/** Creates a CheckpointAttestationHash from a BaseBuffer32. */
export function CheckpointAttestationHash(buf: BaseBuffer32): CheckpointAttestationHash {
  return buf as CheckpointAttestationHash;
}

/** Creates a CheckpointAttestationHash from a raw Buffer. */
CheckpointAttestationHash.fromBuffer = function (buf: Buffer): CheckpointAttestationHash {
  return new Buffer32(buf) as unknown as CheckpointAttestationHash;
};
