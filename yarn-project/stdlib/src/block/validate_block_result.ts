import type { ViemCommitteeAttestations } from '@aztec/ethereum/contracts';
import { EpochNumber, EpochNumberSchema } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { z } from 'zod';

import {
  type CheckpointInfo,
  CheckpointInfoSchema,
  deserializeCheckpointInfo,
  serializeCheckpointInfo,
} from '../checkpoint/checkpoint_info.js';
import { MAX_COMMITTEE_SIZE } from '../deserialization/index.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';

/** Subtype for invalid checkpoint validation results */
export type ValidateCheckpointNegativeResult =
  | {
      valid: false;
      /** Identifiers from the invalid checkpoint */
      checkpoint: CheckpointInfo;
      /** Committee members at the epoch this checkpoint was proposed */
      committee: EthAddress[];
      /** Epoch in which this checkpoint was proposed */
      epoch: EpochNumber;
      /** Proposer selection seed for the epoch */
      seed: bigint;
      /** List of committee members who signed this checkpoint proposal */
      attestors: EthAddress[];
      /** Committee attestations for this checkpoint as they were posted to L1 */
      attestations: CommitteeAttestation[];
      /**
       * The exact packed `CommitteeAttestations` tuple as posted to L1 calldata, carried verbatim so the
       * invalidation evidence is byte-faithful to the stored `attestationsHash`. A repack via
       * `packAttestations` is not a round-trip inverse of `fromPacked`, so it would diverge from the hash
       * and revert `invalidateBadAttestation`/`invalidateInsufficientAttestations`. Always populated on the
       * calldata validation path, the only production source of invalidation evidence.
       */
      verbatimAttestations: ViemCommitteeAttestations;
      /** Reason for the checkpoint being invalid: not enough attestations were posted */
      reason: 'insufficient-attestations';
    }
  | {
      valid: false;
      /** Identifiers from the invalid checkpoint */
      checkpoint: CheckpointInfo;
      /** Committee members at the epoch this checkpoint was proposed */
      committee: EthAddress[];
      /** Epoch in which this checkpoint was proposed */
      epoch: EpochNumber;
      /** Proposer selection seed for the epoch */
      seed: bigint;
      /** List of committee members who signed this checkpoint proposal */
      attestors: EthAddress[];
      /** Committee attestations for this checkpoint as they were posted to L1 */
      attestations: CommitteeAttestation[];
      /**
       * The exact packed `CommitteeAttestations` tuple as posted to L1 calldata, carried verbatim so the
       * invalidation evidence is byte-faithful to the stored `attestationsHash`. See the same field on the
       * insufficient-attestations variant for why a repack cannot be used.
       */
      verbatimAttestations: ViemCommitteeAttestations;
      /** Reason for the checkpoint being invalid: an invalid attestation was posted */
      reason: 'invalid-attestation';
      /** Index in the attestations array of the invalid attestation posted */
      invalidIndex: number;
    };

/** Result type for validating checkpoint attestations */
export type ValidateCheckpointResult = { valid: true } | ValidateCheckpointNegativeResult;

/** Zod schema for the raw packed `CommitteeAttestations` viem tuple (two 0x-prefixed hex strings). */
const ViemCommitteeAttestationsSchema: ZodFor<ViemCommitteeAttestations> = z.object({
  signatureIndices: schemas.HexStringWith0x,
  signaturesOrAddresses: schemas.HexStringWith0x,
});

export const ValidateCheckpointResultSchema: ZodFor<ValidateCheckpointResult> = z.union([
  z.object({ valid: z.literal(true) }),
  z.object({
    valid: z.literal(false),
    checkpoint: CheckpointInfoSchema,
    committee: z.array(schemas.EthAddress),
    epoch: EpochNumberSchema,
    seed: schemas.BigInt,
    attestors: z.array(schemas.EthAddress),
    attestations: z.array(CommitteeAttestation.schema),
    verbatimAttestations: ViemCommitteeAttestationsSchema,
    reason: z.literal('insufficient-attestations'),
  }),
  z.object({
    valid: z.literal(false),
    checkpoint: CheckpointInfoSchema,
    committee: z.array(schemas.EthAddress),
    epoch: EpochNumberSchema,
    seed: schemas.BigInt,
    attestors: z.array(schemas.EthAddress),
    attestations: z.array(CommitteeAttestation.schema),
    verbatimAttestations: ViemCommitteeAttestationsSchema,
    reason: z.literal('invalid-attestation'),
    invalidIndex: z.number(),
  }),
]);

export function serializeValidateCheckpointResult(result: ValidateCheckpointResult): Buffer {
  if (result.valid) {
    return serializeToBuffer(true);
  }

  const checkpointBuffer = serializeCheckpointInfo(result.checkpoint);
  const signatureIndices = hexToBuffer(result.verbatimAttestations.signatureIndices);
  const signaturesOrAddresses = hexToBuffer(result.verbatimAttestations.signaturesOrAddresses);
  return serializeToBuffer(
    result.valid,
    result.reason,
    checkpointBuffer.length,
    checkpointBuffer,
    result.committee.length,
    result.committee,
    result.epoch,
    result.seed ?? 0n,
    result.attestors.length,
    result.attestors,
    result.attestations.length,
    result.attestations,
    result.reason === 'invalid-attestation' ? result.invalidIndex : 0,
    signatureIndices.length,
    signatureIndices,
    signaturesOrAddresses.length,
    signaturesOrAddresses,
  );
}

export function deserializeValidateCheckpointResult(bufferOrReader: Buffer | BufferReader): ValidateCheckpointResult {
  const reader = BufferReader.asReader(bufferOrReader);
  const valid = reader.readBoolean();
  if (valid) {
    return { valid };
  }
  const reason = reader.readString(64) as 'insufficient-attestations' | 'invalid-attestation';
  const checkpoint = deserializeCheckpointInfo(reader.readBuffer());
  const committee = reader.readVector(EthAddress, MAX_COMMITTEE_SIZE);
  const epoch = EpochNumber(reader.readNumber());
  const seed = reader.readBigInt();
  const attestors = reader.readVector(EthAddress, MAX_COMMITTEE_SIZE);
  const attestations = reader.readVector(CommitteeAttestation, MAX_COMMITTEE_SIZE);
  const invalidIndex = reader.readNumber();
  const verbatimAttestations: ViemCommitteeAttestations = {
    signatureIndices: bufferToHex(reader.readBuffer()),
    signaturesOrAddresses: bufferToHex(reader.readBuffer()),
  };

  if (reason === 'insufficient-attestations') {
    return { valid, reason, checkpoint, committee, epoch, seed, attestors, attestations, verbatimAttestations };
  } else if (reason === 'invalid-attestation') {
    return {
      valid,
      reason,
      checkpoint,
      committee,
      epoch,
      seed,
      attestors,
      invalidIndex,
      attestations,
      verbatimAttestations,
    };
  } else {
    const _: never = reason;
    throw new Error(`Unknown reason: ${reason}`);
  }
}
