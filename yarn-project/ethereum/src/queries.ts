import { EthAddress } from '@aztec/foundation/eth-address';
import { SlasherAbi } from '@aztec/l1-artifacts/SlasherAbi';

import { getContract } from 'viem';

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
  const slasherAddress = await rollup.getSlasher();
  const slasher = getContract({ address: slasherAddress, abi: SlasherAbi, client: publicClient });

  const [
    l1StartBlock,
    l1GenesisTime,
    aztecEpochDuration,
    aztecSlotDuration,
    aztecProofSubmissionEpochs,
    aztecTargetCommitteeSize,
    activationThreshold,
    ejectionThreshold,
    governanceProposerQuorum,
    governanceProposerRoundSize,
    slashingQuorum,
    slashingRoundSize,
    slashingLifetimeInRounds,
    slashingExecutionDelayInRounds,
    slashingVetoer,
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
    rollup.getActivationThreshold(),
    rollup.getEjectionThreshold(),
    governanceProposer.getQuorumSize(),
    governanceProposer.getRoundSize(),
    slasherProposer.getQuorumSize(),
    slasherProposer.getRoundSize(),
    slasherProposer.getLifetimeInRounds(),
    slasherProposer.getExecutionDelayInRounds(),
    slasher.read.VETOER(),
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
    governanceProposerQuorum: Number(governanceProposerQuorum),
    governanceProposerRoundSize: Number(governanceProposerRoundSize),
    activationThreshold,
    ejectionThreshold,
    slashingQuorum: Number(slashingQuorum),
    slashingRoundSize: Number(slashingRoundSize),
    slashingLifetimeInRounds: Number(slashingLifetimeInRounds),
    slashingExecutionDelayInRounds: Number(slashingExecutionDelayInRounds),
    slashingVetoer: EthAddress.fromString(slashingVetoer),
    manaTarget: manaTarget,
    provingCostPerMana: provingCostPerMana,
    rollupVersion: Number(rollupVersion),
    genesisArchiveTreeRoot,
    exitDelaySeconds: Number(exitDelay),
  };
}
