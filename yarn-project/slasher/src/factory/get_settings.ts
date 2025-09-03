import type { RollupContract, TallySlashingProposerContract } from '@aztec/ethereum';

import type { TallySlasherSettings } from '../tally_slasher_client.js';

export async function getTallySlasherSettings(
  rollup: RollupContract,
  slashingProposer?: TallySlashingProposerContract,
): Promise<TallySlasherSettings> {
  if (!slashingProposer) {
    const rollupSlashingProposer = await rollup.getSlashingProposer();
    if (!rollupSlashingProposer || rollupSlashingProposer.type !== 'tally') {
      throw new Error('Rollup slashing proposer is not of type tally');
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

  const settings: TallySlasherSettings = {
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
