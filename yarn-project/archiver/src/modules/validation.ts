import type { EpochCache } from '@aztec/epoch-cache';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { Buffer32 } from '@aztec/foundation/buffer';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import {
  type AttestationInfo,
  type CommitteeAttestation,
  type ValidateCheckpointNegativeResult,
  type ValidateCheckpointResult,
  getAttestationInfoFromDigest,
} from '@aztec/stdlib/block';
import { type CheckpointInfo, computeCheckpointPayloadDigest } from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, computeQuorum, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import { type L1CheckpointHeader, l1CheckpointHeaderHash } from '@aztec/stdlib/rollup';

export type { ValidateCheckpointResult };

/**
 * Raw checkpoint data needed to validate attestations. The header and archive root are kept in their raw,
 * possibly out-of-range form (an `L1CheckpointHeader` and `Buffer32`) so that a malicious out-of-range
 * field cannot make validation throw — its consensus digest is derived purely from the raw header hash and
 * raw archive bytes, both of which are always in range.
 */
export type CheckpointForValidation = {
  checkpointNumber: CheckpointNumber;
  header: L1CheckpointHeader;
  archiveRoot: Buffer32;
  feeAssetPriceModifier: bigint;
  attestations: CommitteeAttestation[];
};

/** Builds the CheckpointInfo identifying a (possibly out-of-range) raw checkpoint. */
function toCheckpointInfo(checkpoint: CheckpointForValidation, header: L1CheckpointHeader): CheckpointInfo {
  return {
    archive: checkpoint.archiveRoot,
    lastArchive: lastArchiveRootToFr(header.lastArchiveRoot),
    slotNumber: SlotNumber.fromBigInt(header.slotNumber),
    checkpointNumber: checkpoint.checkpointNumber,
    timestamp: header.timestamp,
  };
}

/**
 * Returns the `lastArchiveRoot` as an `Fr`. `lastArchiveRoot` is forced equal to the on-chain tip archive,
 * which is always field-reduced once it has been stored, so this is in range in practice; we reduce defensively.
 */
function lastArchiveRootToFr(lastArchiveRoot: `0x${string}`): Fr {
  return Fr.fromBufferReduce(Buffer.from(lastArchiveRoot.slice(2).padStart(64, '0'), 'hex'));
}

/**
 * Extracts attestation information from a raw checkpoint, recovering signers against the consensus digest
 * built from the raw header hash and raw archive root.
 */
export function getAttestationInfoFromCheckpoint(
  checkpoint: CheckpointForValidation,
  signatureContext: CoordinationSignatureContext,
): AttestationInfo[] {
  const hashedPayload = computeCheckpointPayloadDigest({
    headerHash: l1CheckpointHeaderHash(checkpoint.header),
    archiveRoot: checkpoint.archiveRoot,
    feeAssetPriceModifier: checkpoint.feeAssetPriceModifier,
    signatureContext,
  });
  return getAttestationInfoFromDigest(hashedPayload, checkpoint.attestations);
}

/**
 * Validates the attestations submitted for the given checkpoint.
 * Returns true if the attestations are valid and sufficient, false otherwise.
 */
export async function validateCheckpointAttestations(
  checkpoint: CheckpointForValidation,
  epochCache: EpochCache,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
  signatureContext: CoordinationSignatureContext,
  logger?: Logger,
): Promise<ValidateCheckpointResult> {
  const { header, attestations } = checkpoint;
  const attestorInfos = getAttestationInfoFromCheckpoint(checkpoint, signatureContext);
  const attestors = compactArray(attestorInfos.map(info => ('address' in info ? info.address : undefined)));
  const headerHash = l1CheckpointHeaderHash(header);
  const archiveRoot = checkpoint.archiveRoot.toString();
  const slot = SlotNumber.fromBigInt(header.slotNumber);
  const epoch: EpochNumber = getEpochAtSlot(slot, constants);
  const { committee, seed } = await epochCache.getCommitteeForEpoch(epoch);
  const logData = { checkpointNumber: checkpoint.checkpointNumber, slot, epoch, headerHash, archiveRoot };

  logger?.debug(
    `Validating attestations for checkpoint ${checkpoint.checkpointNumber} at slot ${slot} in epoch ${epoch}`,
    {
      committee: (committee ?? []).map(member => member.toString()),
      recoveredAttestors: attestorInfos,
      postedAttestations: attestations.map(a => (a.address.isZero() ? a.signature : a.address).toString()),
      ...logData,
    },
  );

  if (!committee || committee.length === 0) {
    logger?.warn(
      `No committee found for epoch ${epoch} at slot ${slot}. Accepting checkpoint without validation.`,
      logData,
    );
    return { valid: true };
  }

  if (await epochCache.isEscapeHatchOpen(epoch)) {
    logger?.warn(`Escape hatch open for epoch ${epoch} at slot ${slot}, skipping checkpoint validation`);
    return { valid: true };
  }

  const requiredAttestationCount = computeQuorum(committee.length);

  const failedValidationResult = <TReason extends ValidateCheckpointNegativeResult['reason']>(reason: TReason) => ({
    valid: false as const,
    reason,
    checkpoint: toCheckpointInfo(checkpoint, header),
    committee,
    seed,
    epoch,
    attestors,
    attestations,
  });

  for (let i = 0; i < attestorInfos.length; i++) {
    const info = attestorInfos[i];

    // Fail on invalid signatures (no address recovered)
    if (info.status === 'invalid-signature' || info.status === 'empty') {
      logger?.warn(`Attestation with empty or invalid signature at slot ${slot}`, {
        committee,
        invalidIndex: i,
        ...logData,
      });
      return { ...failedValidationResult('invalid-attestation'), invalidIndex: i };
    }

    // Check if the attestor at this index matches the committee member at the same index
    if (info.status === 'recovered-from-signature' || info.status === 'provided-as-address') {
      const signer = info.address.toString();
      const expectedCommitteeMember = committee[i]?.toString();

      if (!expectedCommitteeMember || signer !== expectedCommitteeMember) {
        logger?.warn(
          `Attestation at index ${i} from ${signer} does not match expected committee member ${expectedCommitteeMember} at slot ${slot}`,
          {
            committee,
            invalidIndex: i,
            ...logData,
          },
        );
        return { ...failedValidationResult('invalid-attestation'), invalidIndex: i };
      }
    }
  }

  const validAttestationCount = attestorInfos.filter(info => info.status === 'recovered-from-signature').length;
  if (validAttestationCount < requiredAttestationCount) {
    logger?.warn(`Insufficient attestations for checkpoint at slot ${slot}`, {
      requiredAttestations: requiredAttestationCount,
      actualAttestations: validAttestationCount,
      ...logData,
    });
    return failedValidationResult('insufficient-attestations');
  }

  logger?.debug(
    `Checkpoint attestations validated successfully for checkpoint ${checkpoint.checkpointNumber} at slot ${slot}`,
    logData,
  );
  return { valid: true };
}
