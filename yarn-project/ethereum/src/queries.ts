import type { EthAddress } from '@aztec/foundation/eth-address';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import type { Hex } from 'viem';

import type { L1ContractsConfig } from './config.js';
import { GovernanceContract } from './contracts/governance.js';
import { GovernanceProposerContract } from './contracts/governance_proposer.js';
import { RollupContract } from './contracts/rollup.js';
import type { ViemPublicClient } from './types.js';

/** Reads the L1ContractsConfig from L1 contracts. */
export async function getL1ContractsConfig(
  publicClient: ViemPublicClient,
  addresses: { governanceAddress: EthAddress; rollupAddress?: EthAddress },
): Promise<Omit<L1ContractsConfig, 'ethereumSlotDuration'> & { l1StartBlock: bigint; l1GenesisTime: bigint }> {
  const governance = new GovernanceContract(addresses.governanceAddress.toString(), publicClient, undefined);
  const governanceProposerAddress = await governance.getGovernanceProposerAddress();
  const governanceProposer = new GovernanceProposerContract(publicClient, governanceProposerAddress.toString());
  const rollupAddress = addresses.rollupAddress ?? (await governanceProposer.getRollupAddress());
  const rollup = new RollupContract(publicClient, rollupAddress.toString());
  const slasherProposer = await rollup.getSlashingProposer();

  const [
    l1StartBlock,
    l1GenesisTime,
    aztecEpochDuration,
    aztecProofSubmissionWindow,
    aztecSlotDuration,
    aztecTargetCommitteeSize,
    minimumStake,
    governanceProposerQuorum,
    governanceProposerRoundSize,
    slashingQuorum,
    slashingRoundSize,
    manaTarget,
    provingCostPerMana,
  ] = await Promise.all([
    rollup.getL1StartBlock(),
    rollup.getL1GenesisTime(),
    rollup.getEpochDuration(),
    rollup.getProofSubmissionWindow(),
    rollup.getSlotDuration(),
    rollup.getTargetCommitteeSize(),
    rollup.getMinimumStake(),
    governanceProposer.getQuorumSize(),
    governanceProposer.getRoundSize(),
    slasherProposer.getQuorumSize(),
    slasherProposer.getRoundSize(),
    rollup.getManaTarget(),
    rollup.getProvingCostPerMana(),
  ] as const);

  return {
    l1StartBlock,
    l1GenesisTime,
    aztecEpochDuration: Number(aztecEpochDuration),
    aztecProofSubmissionWindow: Number(aztecProofSubmissionWindow),
    aztecSlotDuration: Number(aztecSlotDuration),
    aztecTargetCommitteeSize: Number(aztecTargetCommitteeSize),
    governanceProposerQuorum: Number(governanceProposerQuorum),
    governanceProposerRoundSize: Number(governanceProposerRoundSize),
    minimumStake,
    slashingQuorum: Number(slashingQuorum),
    slashingRoundSize: Number(slashingRoundSize),
    manaTarget: manaTarget,
    provingCostPerMana: provingCostPerMana,
  };
}

export type L2BlockProposedEvent = {
  versionedBlobHashes: readonly Hex[];
  archive: Hex;
  blockNumber: bigint;
};

export async function getL2BlockProposalEvents(
  client: ViemPublicClient,
  blockId: Hex,
  rollupAddress?: EthAddress,
): Promise<L2BlockProposedEvent[]> {
  return (
    await client.getContractEvents({
      abi: RollupAbi,
      address: rollupAddress?.toString(),
      blockHash: blockId,
      eventName: 'L2BlockProposed',
      strict: true,
    })
  ).map(log => log.args);
}
