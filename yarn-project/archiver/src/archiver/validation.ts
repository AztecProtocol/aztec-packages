import type { EpochCache } from '@aztec/epoch-cache';
import type { Logger } from '@aztec/foundation/log';
import { type PublishedL2Block, getAttestationsFromPublishedL2Block } from '@aztec/stdlib/block';
import { type L1RollupConstants, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';

/**
 * Validates the attestations submitted for the given block.
 * Returns true if the attestations are valid and sufficient, false otherwise.
 */
export async function validateBlockAttestations(
  publishedBlock: Pick<PublishedL2Block, 'attestations' | 'block'>,
  epochCache: EpochCache,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
  logger?: Logger,
): Promise<boolean> {
  const attestations = getAttestationsFromPublishedL2Block(publishedBlock);
  const { block } = publishedBlock;
  const slot = block.header.getSlot();
  const epoch = getEpochAtSlot(slot, constants);
  const { committee } = await epochCache.getCommitteeForEpoch(epoch);
  logger?.debug(`Validating attestations for block at slot ${slot} in epoch ${epoch}`, {
    committee: (committee ?? []).map(member => member.toString()),
    recoveredAttestors: attestations.map(a => a.getSender().toString()),
    postedAttestations: publishedBlock.attestations.map(a =>
      a.address.isZero() ? a.signature.toString() : a.address.toString(),
    ),
    blockNumber: block.number,
    slot,
    epoch,
  });

  if (!committee || committee.length === 0) {
    // Q: Should we accept blocks with no committee?
    logger?.warn(`No committee found for epoch ${epoch} at slot ${slot}`);
    return true;
  }

  const committeeSet = new Set(committee.map(member => member.toString()));
  const requiredAttestationCount = Math.floor((committee.length * 2) / 3) + 1;

  for (const attestation of attestations) {
    const signer = attestation.getSender().toString();
    if (!committeeSet.has(signer)) {
      logger?.warn(`Attestation from non-committee member ${signer} at slot ${slot}`, { committee });
      return false;
    }
  }

  if (attestations.length < requiredAttestationCount) {
    logger?.warn(`Insufficient attestations for block at slot ${slot}`, {
      requiredAttestations: requiredAttestationCount,
      actualAttestations: attestations.length,
    });
    return false;
  }

  logger?.debug(`Block attestations validated successfully for block at slot ${slot}`, {
    blockNumber: block.number,
    slot,
    epoch,
  });
  return true;
}
