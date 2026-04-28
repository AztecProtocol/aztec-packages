import type { RollupContract, SlashingProposerContract } from '@aztec/ethereum/contracts';

import type { SlasherSettings } from '../slasher_client.js';

export async function getSlasherSettings(
  rollup: RollupContract,
  slashingProposer?: SlashingProposerContract,
): Promise<Omit<SlasherSettings, 'rollupRegisteredAtL2Slot'>> {
  if (!slashingProposer) {
    const rollupSlashingProposer = await rollup.getSlashingProposer();
    if (!rollupSlashingProposer) {
      throw new Error('Rollup slashing proposer not found');
    }
    slashingProposer = rollupSlashingProposer;
  }

  const [
    slashingExecutionDelayInRounds,
    slashingRoundSize,
    slashingRoundSizeInEpochs,
    slashingLifetimeInRounds,
    slashingOffsetInRounds,
    slashingAmounts,
    slashingQuorumSize,
    epochDuration,
    l1GenesisTime,
    slotDuration,
    targetCommitteeSize,
  ] = await Promise.all([
    slashingProposer.getExecutionDelayInRounds(),
    slashingProposer.getRoundSize(),
    slashingProposer.getRoundSizeInEpochs(),
    slashingProposer.getLifetimeInRounds(),
    slashingProposer.getSlashOffsetInRounds(),
    slashingProposer.getSlashingAmounts(),
    slashingProposer.getQuorumSize(),
    rollup.getEpochDuration(),
    rollup.getL1GenesisTime(),
    rollup.getSlotDuration(),
    rollup.getTargetCommitteeSize(),
  ]);

  const settings: Omit<SlasherSettings, 'rollupRegisteredAtL2Slot'> = {
    slashingExecutionDelayInRounds: Number(slashingExecutionDelayInRounds),
    slashingRoundSize: Number(slashingRoundSize),
    slashingRoundSizeInEpochs: Number(slashingRoundSizeInEpochs),
    slashingLifetimeInRounds: Number(slashingLifetimeInRounds),
    slashingQuorumSize: Number(slashingQuorumSize),
    epochDuration: Number(epochDuration),
    l1GenesisTime: l1GenesisTime,
    slotDuration: Number(slotDuration),
    slashingOffsetInRounds: Number(slashingOffsetInRounds),
    slashingAmounts,
    targetCommitteeSize: Number(targetCommitteeSize),
  };

  return settings;
}
