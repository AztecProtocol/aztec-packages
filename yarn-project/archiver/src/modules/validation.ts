import type { EpochCache } from '@aztec/epoch-cache';
import { type CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import {
  type AttestationInfo,
  type CommitteeAttestation,
  type ValidateCheckpointNegativeResult,
  type ValidateCheckpointResult,
  getAttestationInfoFromPayload,
} from '@aztec/stdlib/block';
import type { CheckpointInfo, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, computeQuorum, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import { ConsensusPayload, type CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';

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
 * Validates the attestations of a checkpoint already retrieved (with its blocks) from blobs.
 * Returns true if the attestations are valid and sufficient, false otherwise.
 */
export function validateCheckpointAttestations(
  publishedCheckpoint: PublishedCheckpoint,
  epochCache: EpochCache,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
  signatureContext: CoordinationSignatureContext,
  logger?: Logger,
): Promise<ValidateCheckpointResult> {
  const { checkpoint, attestations } = publishedCheckpoint;
  const payload = ConsensusPayload.fromCheckpoint(checkpoint, signatureContext);
  return validateAttestations(payload, attestations, checkpoint.toCheckpointInfo(), epochCache, constants, logger);
}

/** The subset of a calldata-only checkpoint needed to validate its committee attestations. */
export type CalldataCheckpointForAttestations = {
  checkpointNumber: CheckpointNumber;
  archiveRoot: Fr;
  feeAssetPriceModifier: bigint;
  header: CheckpointHeader;
  attestations: CommitteeAttestation[];
};

/**
 * Validates the attestations of a checkpoint from L1 calldata only, without fetching or decoding its blobs.
 * The signed consensus payload (header, archive root, fee asset price modifier) is fully available from
 * calldata, so an invalid-attestation checkpoint can be rejected before any (possibly malformed) blob is
 * fetched and decoded.
 */
export function validateCheckpointAttestationsFromCalldata(
  checkpoint: CalldataCheckpointForAttestations,
  epochCache: EpochCache,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
  signatureContext: CoordinationSignatureContext,
  logger?: Logger,
): Promise<ValidateCheckpointResult> {
  const payload = new ConsensusPayload(
    checkpoint.header,
    checkpoint.archiveRoot,
    checkpoint.feeAssetPriceModifier,
    signatureContext,
  );
  const checkpointInfo: CheckpointInfo = {
    archive: checkpoint.archiveRoot,
    lastArchive: checkpoint.header.lastArchiveRoot,
    slotNumber: checkpoint.header.slotNumber,
    checkpointNumber: checkpoint.checkpointNumber,
    timestamp: checkpoint.header.timestamp,
  };
  return validateAttestations(payload, checkpoint.attestations, checkpointInfo, epochCache, constants, logger);
}

/**
 * Core attestation validation over a consensus payload, its attestations, and checkpoint metadata --
 * independent of whether the checkpoint's blocks have been decoded from blobs. Returns true if the
 * attestations are valid and sufficient, false otherwise.
 */
async function validateAttestations(
  payload: ConsensusPayload,
  attestations: CommitteeAttestation[],
  checkpointInfo: CheckpointInfo,
  epochCache: EpochCache,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
  logger?: Logger,
): Promise<ValidateCheckpointResult> {
  const attestorInfos = getAttestationInfoFromPayload(payload, attestations);
  const attestors = compactArray(attestorInfos.map(info => ('address' in info ? info.address : undefined)));
  const headerHash = payload.header.hash();
  const archiveRoot = payload.archive.toString();
  const slot = payload.header.slotNumber;
  const checkpointNumber = checkpointInfo.checkpointNumber;
  const epoch: EpochNumber = getEpochAtSlot(slot, constants);
  const { committee, seed } = await epochCache.getCommitteeForEpoch(epoch);
  const logData = { checkpointNumber, slot, epoch, headerHash, archiveRoot };

  logger?.debug(`Validating attestations for checkpoint ${checkpointNumber} at slot ${slot} in epoch ${epoch}`, {
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
    checkpoint: checkpointInfo,
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
    `Checkpoint attestations validated successfully for checkpoint ${checkpointNumber} at slot ${slot}`,
    logData,
  );
  return { valid: true };
}
