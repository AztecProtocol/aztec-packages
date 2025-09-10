import { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { BlockInfoSchema, type L2BlockInfo, deserializeBlockInfo, serializeBlockInfo } from './l2_block_info.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';

/** Subtype for invalid block validation results */
export type ValidateBlockNegativeResult =
  | {
      valid: false;
      /** Identifiers from the invalid block */
      block: L2BlockInfo;
      /** Committee members at the epoch this block was proposed */
      committee: EthAddress[];
      /** Epoch in which this block was proposed */
      epoch: bigint;
      /** Proposer selection seed for the epoch */
      seed: bigint;
      /** List of committee members who signed this block proposal */
      attestors: EthAddress[];
      /** Committee attestations for this block as they were posted to L1 */
      attestations: CommitteeAttestation[];
      /** Reason for the block being invalid: not enough attestations were posted */
      reason: 'insufficient-attestations';
    }
  | {
      valid: false;
      /** Identifiers from the invalid block */
      block: L2BlockInfo;
      /** Committee members at the epoch this block was proposed */
      committee: EthAddress[];
      /** Epoch in which this block was proposed */
      epoch: bigint;
      /** Proposer selection seed for the epoch */
      seed: bigint;
      /** List of committee members who signed this block proposal */
      attestors: EthAddress[];
      /** Committee attestations for this block as they were posted to L1 */
      attestations: CommitteeAttestation[];
      /** Reason for the block being invalid: an invalid attestation was posted */
      reason: 'invalid-attestation';
      /** Index in the attestations array of the invalid attestation posted */
      invalidIndex: number;
    };

/** Result type for validating a block attestations */
export type ValidateBlockResult = { valid: true } | ValidateBlockNegativeResult;

export const ValidateBlockResultSchema = z.union([
  z.object({ valid: z.literal(true) }),
  z.object({
    valid: z.literal(false),
    block: BlockInfoSchema,
    committee: z.array(schemas.EthAddress),
    epoch: schemas.BigInt,
    seed: schemas.BigInt,
    attestors: z.array(schemas.EthAddress),
    attestations: z.array(CommitteeAttestation.schema),
    reason: z.literal('insufficient-attestations'),
  }),
  z.object({
    valid: z.literal(false),
    block: BlockInfoSchema,
    committee: z.array(schemas.EthAddress),
    epoch: schemas.BigInt,
    seed: schemas.BigInt,
    attestors: z.array(schemas.EthAddress),
    attestations: z.array(CommitteeAttestation.schema),
    reason: z.literal('invalid-attestation'),
    invalidIndex: z.number(),
  }),
]) satisfies ZodFor<ValidateBlockResult>;

export function serializeValidateBlockResult(result: ValidateBlockResult): Buffer {
  if (result.valid) {
    return serializeToBuffer(true);
  }

  const l2Block = serializeBlockInfo(result.block);
  return serializeToBuffer(
    result.valid,
    result.reason,
    l2Block.length,
    l2Block,
    result.committee.length,
    result.committee,
    result.epoch,
    result.seed ?? 0n,
    result.attestors.length,
    result.attestors,
    result.attestations.length,
    result.attestations,
    result.reason === 'invalid-attestation' ? result.invalidIndex : 0,
  );
}

export function deserializeValidateBlockResult(bufferOrReader: Buffer | BufferReader): ValidateBlockResult {
  const reader = BufferReader.asReader(bufferOrReader);
  const valid = reader.readBoolean();
  if (valid) {
    return { valid };
  }
  const reason = reader.readString() as 'insufficient-attestations' | 'invalid-attestation';
  const block = deserializeBlockInfo(reader.readBuffer());
  const committee = reader.readVector(EthAddress);
  const epoch = reader.readBigInt();
  const seed = reader.readBigInt();
  const attestors = reader.readVector(EthAddress);
  const attestations = reader.readVector(CommitteeAttestation);
  const invalidIndex = reader.readNumber();
  if (reason === 'insufficient-attestations') {
    return { valid, reason, block, committee, epoch, seed, attestors, attestations: attestations };
  } else if (reason === 'invalid-attestation') {
    return { valid, reason, block, committee, epoch, seed, attestors, invalidIndex, attestations: attestations };
  } else {
    const _: never = reason;
    throw new Error(`Unknown reason: ${reason}`);
  }
}
