import { type EthAddress } from '@aztec/foundation/eth-address';

import { type L1ContractsConfig } from './config.js';
import { GovernanceContract } from './contracts/governance.js';
import { RollupContract } from './contracts/rollup.js';
import { type L1ContractAddresses } from './l1_contract_addresses.js';
import { type ViemPublicClient } from './types.js';

/** Given the Governance contract address, reads the addresses from all other contracts from L1. */
export async function getL1ContractsAddresses(
  publicClient: ViemPublicClient,
  governanceAddress: EthAddress,
): Promise<Omit<L1ContractAddresses, 'slashFactoryAddress' | 'coinIssuerAddress'>> {
  const governance = new GovernanceContract(publicClient, governanceAddress.toString());
  const governanceAddresses = await governance.getGovernanceAddresses();

  const rollup = new RollupContract(publicClient, governanceAddresses.rollupAddress.toString());
  const rollupAddresses = await rollup.getRollupAddresses();

  return {
    ...governanceAddresses,
    ...rollupAddresses,
  };
}

/** Reads the L1ContractsConfig from L1 contracts. */
export async function getL1ContractsConfig(
  publicClient: ViemPublicClient,
  addresses: { governanceAddress: EthAddress; rollupAddress?: EthAddress },
): Promise<Omit<L1ContractsConfig, 'ethereumSlotDuration'> & { l1StartBlock: bigint; l1GenesisTime: bigint }> {
  const governance = new GovernanceContract(publicClient, addresses.governanceAddress.toString());
  const governanceProposer = await governance.getProposer();
  const rollupAddress = addresses.rollupAddress ?? (await governance.getGovernanceAddresses()).rollupAddress;
  const rollup = new RollupContract(publicClient, rollupAddress.toString());
  const slasherProposer = await rollup.getSlashingProposer();

  const [
    l1StartBlock,
    l1GenesisTime,
    aztecEpochDuration,
    aztecEpochProofClaimWindowInL2Slots,
    aztecSlotDuration,
    aztecTargetCommitteeSize,
    minimumStake,
    governanceProposerQuorum,
    governanceProposerRoundSize,
    slashingQuorum,
    slashingRoundSize,
  ] = await Promise.all([
    rollup.getL1StartBlock(),
    rollup.getL1GenesisTime(),
    rollup.getEpochDuration(),
    rollup.getClaimDurationInL2Slots(),
    rollup.getSlotDuration(),
    rollup.getTargetCommitteeSize(),
    rollup.getMinimumStake(),
    governanceProposer.getQuorumSize(),
    governanceProposer.getRoundSize(),
    slasherProposer.getQuorumSize(),
    slasherProposer.getRoundSize(),
  ] as const);

  return {
    l1StartBlock,
    l1GenesisTime,
    aztecEpochDuration: Number(aztecEpochDuration),
    aztecEpochProofClaimWindowInL2Slots: Number(aztecEpochProofClaimWindowInL2Slots),
    aztecSlotDuration: Number(aztecSlotDuration),
    aztecTargetCommitteeSize: Number(aztecTargetCommitteeSize),
    governanceProposerQuorum: Number(governanceProposerQuorum),
    governanceProposerRoundSize: Number(governanceProposerRoundSize),
    minimumStake,
    slashingQuorum: Number(slashingQuorum),
    slashingRoundSize: Number(slashingRoundSize),
  };
}
