import type { EpochCache } from '@aztec/epoch-cache';
import { compactArray } from '@aztec/foundation/collection';
import type { Logger } from '@aztec/foundation/log';
import {
  type PublishedL2Block,
  type ValidateBlockResult,
  getAttestationsFromPublishedL2Block,
} from '@aztec/stdlib/block';
import { type L1RollupConstants, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';

export type { ValidateBlockResult };

/**
 * Validates the attestations submitted for the given block.
 * Returns true if the attestations are valid and sufficient, false otherwise.
 */
export async function validateBlockAttestations(
  publishedBlock: PublishedL2Block,
  epochCache: EpochCache,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
  logger?: Logger,
): Promise<ValidateBlockResult> {
  const attestations = getAttestationsFromPublishedL2Block(publishedBlock);
  const attestors = compactArray(attestations.map(a => a?.tryGetSender()));
  const { block } = publishedBlock;
  const blockHash = await block.hash().then(hash => hash.toString());
  const archiveRoot = block.archive.root.toString();
  const slot = block.header.getSlot();
  const epoch = getEpochAtSlot(slot, constants);
  const { committee, seed } = await epochCache.getCommitteeForEpoch(epoch);
  const logData = { blockNumber: block.number, slot, epoch, blockHash, archiveRoot };

  logger?.debug(`Validating attestations for block ${block.number} at slot ${slot} in epoch ${epoch}`, {
    committee: (committee ?? []).map(member => member.toString()),
    recoveredAttestors: attestors.map(member => member.toString()),
    invalidAttestations: attestations
      .filter(a => a !== undefined && a.tryGetSender() === undefined)
      .map(a => a?.toInspect()),
    postedAttestations: publishedBlock.attestations.map(a => (a.address.isZero() ? a.signature : a.address).toString()),
    ...logData,
  });

  if (!committee || committee.length === 0) {
    logger?.warn(`No committee found for epoch ${epoch} at slot ${slot}. Accepting block without validation.`, logData);
    return { valid: true };
  }

  const committeeSet = new Set(committee.map(member => member.toString()));
  const requiredAttestationCount = Math.floor((committee.length * 2) / 3) + 1;

  for (let i = 0; i < attestations.length; i++) {
    const attestation = attestations[i];

    // Skip empty signatures (undefined entries)
    if (attestation === undefined) {
      continue;
    }

    const signer = attestation.tryGetSender()?.toString();
    if (signer !== undefined && committeeSet.has(signer)) {
      continue;
    }

    if (signer === undefined) {
      logger?.warn(`Attestation with invalid signature at slot ${slot}`, { committee, ...logData });
    } else {
      logger?.warn(`Attestation from non-committee member ${signer} at slot ${slot}`, { committee, ...logData });
    }

    const reason = 'invalid-attestation';
    return {
      valid: false,
      reason,
      invalidIndex: i,
      block: publishedBlock.block.toBlockInfo(),
      committee,
      seed,
      epoch,
      attestors,
      attestations: publishedBlock.attestations,
    };
  }

  const validAttestationCount = compactArray(attestations).length;
  if (validAttestationCount < requiredAttestationCount) {
    logger?.warn(`Insufficient attestations for block at slot ${slot}`, {
      requiredAttestations: requiredAttestationCount,
      actualAttestations: validAttestationCount,
      ...logData,
    });
    const reason = 'insufficient-attestations';
    return {
      valid: false,
      reason,
      block: publishedBlock.block.toBlockInfo(),
      committee,
      seed,
      epoch,
      attestors,
      attestations: publishedBlock.attestations,
    };
  }

  logger?.debug(`Block attestations validated successfully for block ${block.number} at slot ${slot}`, logData);
  return { valid: true };
}
