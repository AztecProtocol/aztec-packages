import type { EpochCache } from '@aztec/epoch-cache';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import type { Logger } from '@aztec/foundation/log';
import {
  type AttestationInfo,
  type ValidateCheckpointNegativeResult,
  type ValidateCheckpointResult,
  getAttestationInfoFromPayload,
} from '@aztec/stdlib/block';
import type { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { ConsensusPayload, type CoordinationSignatureContext } from '@aztec/stdlib/consensus';
import { type L1RollupConstants, computeQuorum, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';

export type { ValidateCheckpointResult };

/**
 * Extracts attestation information from a published checkpoint.
 * Returns info for each attestation, preserving array indices.
 */
export function getAttestationInfoFromPublishedCheckpoint(
  { checkpoint, attestations }: PublishedCheckpoint,
  signatureContext: CoordinationSignatureContext,
): AttestationInfo[] {
  const payload = ConsensusPayload.fromCheckpoint(checkpoint, signatureContext);
  return getAttestationInfoFromPayload(payload, attestations);
}

/**
 * Validates the attestations submitted for the given checkpoint.
 * Returns true if the attestations are valid and sufficient, false otherwise.
 */
export async function validateCheckpointAttestations(
  publishedCheckpoint: PublishedCheckpoint,
  epochCache: EpochCache,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
  signatureContext: CoordinationSignatureContext,
  logger?: Logger,
): Promise<ValidateCheckpointResult> {
  const attestorInfos = getAttestationInfoFromPublishedCheckpoint(publishedCheckpoint, signatureContext);
  const attestors = compactArray(attestorInfos.map(info => ('address' in info ? info.address : undefined)));
  const { checkpoint, attestations } = publishedCheckpoint;
  const headerHash = checkpoint.header.hash();
  const archiveRoot = checkpoint.archive.root.toString();
  const slot = checkpoint.header.slotNumber;
  const epoch: EpochNumber = getEpochAtSlot(slot, constants);
  const { committee, seed } = await epochCache.getCommitteeForEpoch(epoch);
  const logData = { checkpointNumber: checkpoint.number, slot, epoch, headerHash, archiveRoot };

  logger?.debug(`Validating attestations for checkpoint ${checkpoint.number} at slot ${slot} in epoch ${epoch}`, {
    committee: (committee ?? []).map(member => member.toString()),
    recoveredAttestors: attestorInfos,
    postedAttestations: attestations.map(a => (a.address.isZero() ? a.signature : a.address).toString()),
    ...logData,
  });

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
    checkpoint: checkpoint.toCheckpointInfo(),
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
    `Checkpoint attestations validated successfully for checkpoint ${checkpoint.number} at slot ${slot}`,
    logData,
  );
  return { valid: true };
}
