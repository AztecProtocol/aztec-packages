import type { EpochCache } from '@aztec/epoch-cache';
import { compactArray } from '@aztec/foundation/collection';
import type { Logger } from '@aztec/foundation/log';
import {
  type PublishedL2Block,
  type ValidateBlockNegativeResult,
  type ValidateBlockResult,
  getAttestationInfoFromPublishedL2Block,
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
  const attestorInfos = getAttestationInfoFromPublishedL2Block(publishedBlock);
  const attestors = compactArray(attestorInfos.map(info => ('address' in info ? info.address : undefined)));
  const { block } = publishedBlock;
  const blockHash = await block.hash().then(hash => hash.toString());
  const archiveRoot = block.archive.root.toString();
  const slot = block.header.getSlot();
  const epoch = getEpochAtSlot(slot, constants);
  const { committee, seed } = await epochCache.getCommitteeForEpoch(epoch);
  const logData = { blockNumber: block.number, slot, epoch, blockHash, archiveRoot };

  logger?.debug(`Validating attestations for block ${block.number} at slot ${slot} in epoch ${epoch}`, {
    committee: (committee ?? []).map(member => member.toString()),
    recoveredAttestors: attestorInfos,
    postedAttestations: publishedBlock.attestations.map(a => (a.address.isZero() ? a.signature : a.address).toString()),
    ...logData,
  });

  if (!committee || committee.length === 0) {
    logger?.warn(`No committee found for epoch ${epoch} at slot ${slot}. Accepting block without validation.`, logData);
    return { valid: true };
  }

  const committeeSet = new Set(committee.map(member => member.toString()));
  const requiredAttestationCount = Math.floor((committee.length * 2) / 3) + 1;

  const failedValidationResult = <TReason extends ValidateBlockNegativeResult['reason']>(reason: TReason) => ({
    valid: false as const,
    reason,
    block: publishedBlock.block.toBlockInfo(),
    committee,
    seed,
    epoch,
    attestors,
    attestations: publishedBlock.attestations,
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

    // Check if the attestor is in the committee
    if (info.status === 'recovered-from-signature' || info.status === 'provided-as-address') {
      const signer = info.address.toString();
      if (!committeeSet.has(signer)) {
        logger?.warn(`Attestation from non-committee member ${signer} at slot ${slot}`, {
          committee,
          invalidIndex: i,
          ...logData,
        });
        return { ...failedValidationResult('invalid-attestation'), invalidIndex: i };
      }
    }
  }

  const validAttestationCount = attestorInfos.filter(info => info.status === 'recovered-from-signature').length;
  if (validAttestationCount < requiredAttestationCount) {
    logger?.warn(`Insufficient attestations for block at slot ${slot}`, {
      requiredAttestations: requiredAttestationCount,
      actualAttestations: validAttestationCount,
      ...logData,
    });
    return failedValidationResult('insufficient-attestations');
  }

  logger?.debug(`Block attestations validated successfully for block ${block.number} at slot ${slot}`, logData);
  return { valid: true };
}
