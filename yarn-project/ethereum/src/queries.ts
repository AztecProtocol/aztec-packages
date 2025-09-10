import { EthAddress } from '@aztec/foundation/eth-address';

import type { L1ContractsConfig } from './config.js';
import { ReadOnlyGovernanceContract } from './contracts/governance.js';
import { GovernanceProposerContract } from './contracts/governance_proposer.js';
import { RollupContract } from './contracts/rollup.js';
import type { ViemPublicClient } from './types.js';

/** Reads the L1ContractsConfig from L1 contracts. */
export async function getL1ContractsConfig(
  publicClient: ViemPublicClient,
  addresses: { governanceAddress: EthAddress; rollupAddress?: EthAddress },
): Promise<
  Omit<L1ContractsConfig, 'ethereumSlotDuration'> & {
    l1StartBlock: bigint;
    l1GenesisTime: bigint;
    rollupVersion: number;
    genesisArchiveTreeRoot: `0x${string}`;
  }
> {
  const governance = new ReadOnlyGovernanceContract(addresses.governanceAddress.toString(), publicClient);
  const governanceProposerAddress = await governance.getGovernanceProposerAddress();
  const governanceProposer = new GovernanceProposerContract(publicClient, governanceProposerAddress.toString());
  const rollupAddress = addresses.rollupAddress ?? (await governanceProposer.getRollupAddress());
  const rollup = new RollupContract(publicClient, rollupAddress.toString());
  const slasherProposer = await rollup.getSlashingProposer();
  const slasher = await rollup.getSlasherContract();

  const [
    l1StartBlock,
    l1GenesisTime,
    aztecEpochDuration,
    aztecSlotDuration,
    aztecProofSubmissionEpochs,
    aztecTargetCommitteeSize,
    lagInEpochs,
    activationThreshold,
    ejectionThreshold,
    localEjectionThreshold,
    governanceProposerQuorum,
    governanceProposerRoundSize,
    slashingQuorum,
    slashingRoundSize,
    slashingLifetimeInRounds,
    slashingExecutionDelayInRounds,
    slashingOffsetInRounds,
    slashingAmounts,
    slashingVetoer,
    slashingDisableDuration,
    manaTarget,
    provingCostPerMana,
    rollupVersion,
    genesisArchiveTreeRoot,
    exitDelay,
  ] = await Promise.all([
    rollup.getL1StartBlock(),
    rollup.getL1GenesisTime(),
    rollup.getEpochDuration(),
    rollup.getSlotDuration(),
    rollup.getProofSubmissionEpochs(),
    rollup.getTargetCommitteeSize(),
    rollup.getLagInEpochs(),
    rollup.getActivationThreshold(),
    rollup.getEjectionThreshold(),
    rollup.getLocalEjectionThreshold(),
    governanceProposer.getQuorumSize(),
    governanceProposer.getRoundSize(),
    slasherProposer?.getQuorumSize() ?? 0n,
    slasherProposer?.getRoundSize() ?? 0n,
    slasherProposer?.getLifetimeInRounds() ?? 0n,
    slasherProposer?.getExecutionDelayInRounds() ?? 0n,
    slasherProposer?.type === 'tally' ? slasherProposer.getSlashOffsetInRounds() : 0n,
    slasherProposer?.type === 'tally' ? slasherProposer.getSlashingAmounts() : [0n, 0n, 0n],
    slasher?.getVetoer() ?? EthAddress.ZERO,
    slasher?.getSlashingDisableDuration() ?? 0,
    rollup.getManaTarget(),
    rollup.getProvingCostPerMana(),
    rollup.getVersion(),
    rollup.getGenesisArchiveTreeRoot(),
    rollup.getExitDelay(),
  ] as const);

  return {
    l1StartBlock,
    l1GenesisTime,
    aztecEpochDuration: Number(aztecEpochDuration),
    aztecSlotDuration: Number(aztecSlotDuration),
    aztecProofSubmissionEpochs: Number(aztecProofSubmissionEpochs),
    aztecTargetCommitteeSize: Number(aztecTargetCommitteeSize),
    lagInEpochs: Number(lagInEpochs),
    governanceProposerQuorum: Number(governanceProposerQuorum),
    governanceProposerRoundSize: Number(governanceProposerRoundSize),
    activationThreshold,
    ejectionThreshold,
    localEjectionThreshold,
    slashingQuorum: Number(slashingQuorum),
    slashingRoundSizeInEpochs: Number(slashingRoundSize / aztecEpochDuration),
    slashingLifetimeInRounds: Number(slashingLifetimeInRounds),
    slashingExecutionDelayInRounds: Number(slashingExecutionDelayInRounds),
    slashingVetoer,
    slashingDisableDuration,
    manaTarget,
    provingCostPerMana: provingCostPerMana,
    rollupVersion: Number(rollupVersion),
    genesisArchiveTreeRoot,
    exitDelaySeconds: Number(exitDelay),
    slasherFlavor: slasherProposer?.type ?? 'tally',
    slashingOffsetInRounds: Number(slashingOffsetInRounds),
    slashAmountSmall: slashingAmounts[0],
    slashAmountMedium: slashingAmounts[1],
    slashAmountLarge: slashingAmounts[2],
  };
}
