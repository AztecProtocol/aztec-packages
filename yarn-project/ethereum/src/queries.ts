import { EthAddress } from '@aztec/foundation/eth-address';

import { BaseError, type Block } from 'viem';

import { DefaultL1ContractsConfig, type L1ContractsConfig } from './config.js';
import { ReadOnlyGovernanceContract } from './contracts/governance.js';
import { GovernanceProposerContract } from './contracts/governance_proposer.js';
import { RollupContract } from './contracts/rollup.js';
import type { ViemClient, ViemPublicClient } from './types.js';

/**
 * Returns the L1 finalized block, or `undefined` if the chain does not yet have one
 * (common on freshly started devnets). Rethrows any other RPC error.
 */
export async function getFinalizedL1Block(client: ViemClient): Promise<Block<bigint, false, 'finalized'> | undefined> {
  try {
    return await client.getBlock({ blockTag: 'finalized', includeTransactions: false });
  } catch (err) {
    if (isFinalizedBlockTagNotFoundError(err)) {
      return undefined;
    }
    throw err;
  }
}

// Error messages returned by popular Ethereum execution clients when
// eth_getBlockByNumber / eth_call is called with blockTag "finalized" or
// "safe" and no such block has been produced yet:
//
//   geth       "finalized block not found"
//              "safe block not found"
//   reth       "block not found: finalized"
//              "block not found: safe"
//   nethermind "Unknown block error"           (same for both tags)
//   besu       "Unknown block"
//   erigon     'block "finalized" not available (head block: N)'
//              'block "safe" not available (head block: N)'
//
// A combined regex covers all five:
const FINALIZED_BLOCK_TAG_NOT_FOUND_MESSAGE_RE =
  /(finalized|safe) block not found|block not found: (finalized|safe)|unknown block|block "(finalized|safe)" not available/i;

/**
 * Returns true if the error originates from an RPC call that failed because
 * the "finalized" (or "safe") block tag is not yet available on the chain.
 */
export function isFinalizedBlockTagNotFoundError(err: unknown): boolean {
  if (!err) {
    return false;
  }

  if (err instanceof BaseError) {
    const hit = err.walk((e: any) => matchesFinalizedBlockTagNotFound(e));
    if (hit) {
      return true;
    }
  }

  for (let cur: any = err, i = 0; cur && i < 10; cur = cur.cause, i++) {
    if (matchesFinalizedBlockTagNotFound(cur)) {
      return true;
    }
  }
  return false;
}

function matchesFinalizedBlockTagNotFound(e: any): boolean {
  if (!e) {
    return false;
  }
  const text = `${e.details ?? ''} ${e.message ?? ''} ${e.shortMessage ?? ''}`;
  return FINALIZED_BLOCK_TAG_NOT_FOUND_MESSAGE_RE.test(text);
}

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
    lagInEpochsForValidatorSet,
    lagInEpochsForRandao,
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
    rollup.getLagInEpochsForValidatorSet(),
    rollup.getLagInEpochsForRandao(),
    rollup.getActivationThreshold(),
    rollup.getEjectionThreshold(),
    rollup.getLocalEjectionThreshold(),
    governanceProposer.getQuorumSize(),
    governanceProposer.getRoundSize(),
    slasherProposer?.getQuorumSize() ?? 0n,
    slasherProposer?.getRoundSize() ?? 0n,
    slasherProposer?.getLifetimeInRounds() ?? 0n,
    slasherProposer?.getExecutionDelayInRounds() ?? 0n,
    slasherProposer?.getSlashOffsetInRounds() ?? 0n,
    slasherProposer?.getSlashingAmounts() ?? [0n, 0n, 0n],
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
    lagInEpochsForValidatorSet: Number(lagInEpochsForValidatorSet),
    lagInEpochsForRandao: Number(lagInEpochsForRandao),
    governanceProposerQuorum: Number(governanceProposerQuorum),
    governanceProposerRoundSize: Number(governanceProposerRoundSize),
    governanceVotingDuration: DefaultL1ContractsConfig.governanceVotingDuration,
    activationThreshold,
    ejectionThreshold,
    localEjectionThreshold,
    slashingQuorum: Number(slashingQuorum),
    slashingRoundSizeInEpochs: Number(Number(slashingRoundSize) / aztecEpochDuration),
    slashingLifetimeInRounds: Number(slashingLifetimeInRounds),
    slashingExecutionDelayInRounds: Number(slashingExecutionDelayInRounds),
    slashingVetoer,
    slashingDisableDuration,
    manaTarget,
    provingCostPerMana: provingCostPerMana,
    rollupVersion: Number(rollupVersion),
    genesisArchiveTreeRoot: genesisArchiveTreeRoot.toString(),
    exitDelaySeconds: Number(exitDelay),
    slasherEnabled: !!slasherProposer,
    slashingOffsetInRounds: Number(slashingOffsetInRounds),
    slashAmountSmall: slashingAmounts[0],
    slashAmountMedium: slashingAmounts[1],
    slashAmountLarge: slashingAmounts[2],
    initialEthPerFeeAsset: DefaultL1ContractsConfig.initialEthPerFeeAsset,
    // Not exposed by the rollup contract; fall back to defaults like the other non-on-chain fields above.
    entryQueueBootstrapValidatorSetSize: DefaultL1ContractsConfig.entryQueueBootstrapValidatorSetSize,
    entryQueueBootstrapFlushSize: DefaultL1ContractsConfig.entryQueueBootstrapFlushSize,
    entryQueueFlushSizeMin: DefaultL1ContractsConfig.entryQueueFlushSizeMin,
    entryQueueFlushSizeQuotient: DefaultL1ContractsConfig.entryQueueFlushSizeQuotient,
    entryQueueMaxFlushSize: DefaultL1ContractsConfig.entryQueueMaxFlushSize,
  };
}
