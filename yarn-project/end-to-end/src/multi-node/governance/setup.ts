import { RollupContract } from '@aztec/ethereum/contracts';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { GovernanceAbi, GovernanceProposerAbi } from '@aztec/l1-artifacts';

import { jest } from '@jest/globals';
import { type GetContractReturnType, encodeFunctionData, getAddress, getContract } from 'viem';

import type { MultiNodeTestContext } from '../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

/**
 * The shortened block-time timing the governance tests run on: a 12s L2 slot, 4s L1 slot, and a long
 * proof-submission window so unproven blocks are never pruned (the committee runs no prover). Spread into
 * a {@link MultiNodeTestContext.setup} call alongside {@link MOCK_GOSSIP_MULTI_VALIDATOR_OPTS} and
 * `initialValidators`.
 */
export const GOVERNANCE_TIMING = {
  aztecSlotDuration: 12,
  ethereumSlotDuration: 4,
  aztecProofSubmissionEpochs: 640,
} as const;

/** The current round leader's payload and its signal count, as observed by {@link GovernanceTestDriver.govInfo}. */
type GovRoundState = { round: bigint; leaderVotes: bigint };

/**
 * Wraps the L1 governance-proposer / governance / rollup contracts and the round-driving mechanics shared by
 * the governance suites (`add_rollup`, `upgrade_governance_proposer`): warping to round boundaries, polling
 * round state, waiting for signal quorum, submitting the round winner, and voting a proposal through to
 * executable. Scenario-specific payload construction, node signaling, and post-execution assertions stay in
 * each test.
 */
export interface GovernanceTestDriver {
  governanceProposer: GetContractReturnType<typeof GovernanceProposerAbi, ExtendedViemWalletClient>;
  governance: GetContractReturnType<typeof GovernanceAbi, ExtendedViemWalletClient>;
  rollup: RollupContract;
  roundSize: bigint;
  emperor: ExtendedViemWalletClient['account'];
  /** Sends a 1-wei self-transfer to mine a fresh L1 block, so warped time takes effect. */
  waitL1Block: () => Promise<void>;
  /** Reads the current round's leading payload and its signal count. */
  govInfo: () => Promise<GovRoundState>;
  /** Warps L1 to the start of the next governance-proposer round. */
  warpToNextRound: () => Promise<void>;
  /** Polls once per L2 slot until the round leader reaches quorum, returning the round state at that point. */
  waitForQuorum: (quorumSize: bigint, timeoutSeconds: number) => Promise<GovRoundState>;
  /** Submits the winning payload of `round` to the governance proposer, creating the on-chain proposal. */
  submitRoundWinner: (round: bigint) => Promise<void>;
  /**
   * Warps past the proposal's voting delay, casts a yes vote (asserting it lands), then warps past the
   * voting duration and execution delay so the proposal becomes executable.
   */
  voteToExecutable: () => Promise<void>;
}

/** Builds a {@link GovernanceTestDriver} over the context's L1 governance contracts. */
export async function createGovernanceTestDriver(
  test: MultiNodeTestContext,
  l1TxUtils: L1TxUtils,
): Promise<GovernanceTestDriver> {
  const { l1Client, l1ContractAddresses } = test.context.deployL1ContractsValues;
  const rollupAddress = l1ContractAddresses.rollupAddress.toString();

  const governanceProposer = getContract({
    address: getAddress(l1ContractAddresses.governanceProposerAddress.toString()),
    abi: GovernanceProposerAbi,
    client: l1Client,
  });
  const governance = getContract({
    address: getAddress(l1ContractAddresses.governanceAddress.toString()),
    abi: GovernanceAbi,
    client: l1Client,
  });
  const rollup = new RollupContract(l1Client, l1ContractAddresses.rollupAddress);
  const roundSize = await governanceProposer.read.ROUND_SIZE();
  const emperor = l1Client.account;

  const waitL1Block = async () => {
    await l1TxUtils.sendAndMonitorTransaction({ to: emperor.address, value: 1n });
  };

  const govInfo = async (): Promise<GovRoundState> => {
    const bn = await test.context.cheatCodes.eth.blockNumber();
    const slot = await rollup.getSlotNumber();
    const round = await governanceProposer.read.computeRound([BigInt(slot)]);
    const info = await governanceProposer.read.getRoundData([rollupAddress, round]);
    const leaderVotes = await governanceProposer.read.signalCount([rollupAddress, round, info.payloadWithMostSignals]);
    test.logger.info(
      `Governance stats for round ${round} (Slot: ${slot}, BN: ${bn}). Leader: ${info.payloadWithMostSignals} have ${leaderVotes} signals`,
    );
    return { round, leaderVotes };
  };

  const warpToNextRound = async () => {
    const currentSlot = await rollup.getSlotNumber();
    const nextRoundSlot = SlotNumber.fromBigInt((BigInt(currentSlot) / roundSize) * roundSize + roundSize);
    const nextRoundTimestamp = await rollup.getTimestampForSlot(nextRoundSlot);
    await test.context.cheatCodes.eth.warp(Number(nextRoundTimestamp));
  };

  const waitForQuorum = (quorumSize: bigint, timeoutSeconds: number) =>
    retryUntil(
      async () => {
        const data = await govInfo();
        return data.leaderVotes >= quorumSize ? data : undefined;
      },
      'governance leader reaches quorum',
      timeoutSeconds,
      GOVERNANCE_TIMING.aztecSlotDuration,
    );

  const submitRoundWinner = async (round: bigint) => {
    await l1TxUtils.sendAndMonitorTransaction({
      to: governanceProposer.address,
      data: encodeFunctionData({ abi: GovernanceProposerAbi, functionName: 'submitRoundWinner', args: [round] }),
    });
  };

  const voteToExecutable = async () => {
    const proposal = await governance.read.getProposal([0n]);

    const timeToActive = proposal.creation + proposal.config.votingDelay;
    await test.context.cheatCodes.eth.warp(Number(timeToActive + 1n));
    await waitL1Block();

    const voteTx = await rollup.vote(l1TxUtils, 0n);
    expect(voteTx.receipt?.status).toBe('success');

    const timeToExecutable = timeToActive + proposal.config.votingDuration + proposal.config.executionDelay + 1n;
    await test.context.cheatCodes.eth.warp(Number(timeToExecutable));
    await waitL1Block();
  };

  return {
    governanceProposer,
    governance,
    rollup,
    roundSize,
    emperor,
    waitL1Block,
    govInfo,
    warpToNextRound,
    waitForQuorum,
    submitRoundWinner,
    voteToExecutable,
  };
}

/**
 * Drives one governance round to an executable proposal: waits for the signaled payload to reach quorum,
 * warps to the next round, submits the round winner, then votes the resulting proposal through its voting
 * and execution delays. Returns the round state observed at quorum; the caller performs the scenario-specific
 * execution and assertions.
 */
export async function driveGovernanceRound(
  driver: GovernanceTestDriver,
  opts: { quorumTimeoutSeconds: number },
): Promise<{ govData: GovRoundState }> {
  const quorumSize = await driver.governanceProposer.read.QUORUM_SIZE();
  const govData = await driver.waitForQuorum(quorumSize, opts.quorumTimeoutSeconds);
  await driver.warpToNextRound();
  await driver.waitL1Block();
  await driver.submitRoundWinner(govData.round);
  await driver.voteToExecutable();
  return { govData };
}

export { jest };
