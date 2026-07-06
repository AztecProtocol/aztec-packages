import { RollupContract } from '@aztec/ethereum/contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import { L1TxUtils, createL1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import {
  GovernanceAbi,
  GovernanceProposerAbi,
  NewGovernanceProposerPayloadAbi,
  NewGovernanceProposerPayloadBytecode,
} from '@aztec/l1-artifacts';

import { encodeFunctionData, getAddress, getContract } from 'viem';

import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MultiNodeTestContext,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';
import { GOVERNANCE_TIMING, jest } from './setup.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;

jest.setTimeout(1000 * 60 * 10);

/**
 * This tests emulate the same test as in l1-contracts/test/governance/scenario/UpgradeGovernanceProposerTest.t.sol
 * but it does so in an end-to-end manner with multiple nodes.
 *
 * Setup: MultiNodeTestContext on the mock-gossip bus, GOVERNANCE_TIMING (ethSlot=4s, aztecSlot=12s,
 * proofSubEpochs=640), 4 validators, governanceProposerRoundSize=10, activationThreshold=1e22,
 * ejectionThreshold=5e21, minTxsPerBlock=0, inboxLag=2. No prover. jest.setTimeout=10m.
 */
describe('multi-node/governance/upgrade_governance_proposer', () => {
  let test: MultiNodeTestContext;
  let l1TxUtils: L1TxUtils;

  beforeEach(async () => {
    test = await MultiNodeTestContext.setup({
      ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
      ...GOVERNANCE_TIMING,
      listenAddress: '127.0.0.1',
      aztecTargetCommitteeSize: NUM_VALIDATORS,
      governanceProposerRoundSize: 10,
      activationThreshold: 10n ** 22n,
      ejectionThreshold: 5n ** 22n,
      inboxLag: 2,
      minTxsPerBlock: 0,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });

    l1TxUtils = createL1TxUtils(test.context.deployL1ContractsValues.l1Client);
  });

  afterEach(async () => {
    await test.teardown();
  });

  // Creates 4 validator nodes configured to signal a new GovernanceProposerPayload. Waits for quorum,
  // warps past round boundary, submits the round winner, then drives the full governance lifecycle
  // (vote, execution delay, execute). Asserts the governance contract's governanceProposer changes.
  it('should cast votes to upgrade governanceProposer', async () => {
    const governanceProposer = getContract({
      address: getAddress(
        test.context.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString(),
      ),
      abi: GovernanceProposerAbi,
      client: test.context.deployL1ContractsValues.l1Client,
    });

    const roundSize = await governanceProposer.read.ROUND_SIZE();

    const governance = getContract({
      address: getAddress(test.context.deployL1ContractsValues.l1ContractAddresses.governanceAddress.toString()),
      abi: GovernanceAbi,
      client: test.context.deployL1ContractsValues.l1Client,
    });

    const rollup = new RollupContract(
      test.context.deployL1ContractsValues.l1Client,
      test.context.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    );

    const gseAddress = await rollup.getGSE();

    const waitL1Block = async () => {
      await l1TxUtils.sendAndMonitorTransaction({
        to: emperor.address,
        value: 1n,
      });
    };

    const currentSlot = await rollup.getSlotNumber();
    const nextRoundSlot = SlotNumber.fromBigInt((BigInt(currentSlot) / roundSize) * roundSize + roundSize);
    const nextRoundTimestamp = await rollup.getTimestampForSlot(nextRoundSlot);
    await test.context.cheatCodes.eth.warp(Number(nextRoundTimestamp));

    const { address: newPayloadAddress } = await deployL1Contract(
      test.context.deployL1ContractsValues.l1Client,
      NewGovernanceProposerPayloadAbi,
      NewGovernanceProposerPayloadBytecode,
      [test.context.deployL1ContractsValues.l1ContractAddresses.registryAddress.toString(), gseAddress.toString()],
    );

    test.logger.info(`Deployed new payload at ${newPayloadAddress}`);

    const emperor = test.context.deployL1ContractsValues.l1Client.account;

    const govInfo = async () => {
      const bn = await test.context.cheatCodes.eth.blockNumber();
      const slot = await rollup.getSlotNumber();
      const round = await governanceProposer.read.computeRound([BigInt(slot)]);

      const info = await governanceProposer.read.getRoundData([
        test.context.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round,
      ]);
      const leaderVotes = await governanceProposer.read.signalCount([
        test.context.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round,
        info.payloadWithMostSignals,
      ]);
      test.logger.info(
        `Governance stats for round ${round} (Slot: ${slot}, BN: ${bn}). Leader: ${info.payloadWithMostSignals} have ${leaderVotes} signals`,
      );
      return { bn, slot, round, info, leaderVotes };
    };

    await waitL1Block();

    const govBefore = await govInfo();

    test.logger.info('Creating nodes');
    // Nodes are torn down by test.teardown(); they only need to be running to signal the payload.
    await Promise.all(
      Array.from({ length: NUM_VALIDATORS }, (_, i) =>
        test.createValidatorNodeAt(i, { governanceProposerPayload: newPayloadAddress }),
      ),
    );

    await sleep(4000);

    test.logger.info('Start progressing time to cast signals');
    const quorumSize = await governanceProposer.read.QUORUM_SIZE();
    test.logger.info(`Quorum size: ${quorumSize}, round size: ${await governanceProposer.read.ROUND_SIZE()}`);

    const govData = await retryUntil(
      async () => {
        const data = await govInfo();
        return data.leaderVotes >= quorumSize ? data : undefined;
      },
      'quorum of signals',
      Number(quorumSize) * GOVERNANCE_TIMING.aztecSlotDuration * 3,
      GOVERNANCE_TIMING.aztecSlotDuration,
    );

    expect(govData.leaderVotes).toBeGreaterThan(govBefore.leaderVotes);

    const currentSlot2 = await rollup.getSlotNumber();
    const nextRoundSlot2 = SlotNumber.fromBigInt((BigInt(currentSlot2) / roundSize) * roundSize + roundSize);
    const nextRoundTimestamp2 = await rollup.getTimestampForSlot(nextRoundSlot2);
    test.logger.info(`Warping to ${nextRoundTimestamp2}`);
    await test.context.cheatCodes.eth.warp(Number(nextRoundTimestamp2));

    await waitL1Block();

    test.logger.info(`Submitting winner of round ${govData.round}`);

    await l1TxUtils.sendAndMonitorTransaction({
      to: governanceProposer.address,
      data: encodeFunctionData({
        abi: GovernanceProposerAbi,
        functionName: 'submitRoundWinner',
        args: [govData.round],
      }),
    });

    test.logger.info(`Submitted winner of round ${govData.round}`);

    const proposal = await governance.read.getProposal([0n]);

    const timeToActive = proposal.creation + proposal.config.votingDelay;
    test.logger.info(`Warping to ${timeToActive + 1n}`);
    await test.context.cheatCodes.eth.warp(Number(timeToActive + 1n));
    test.logger.info(`Warped to ${timeToActive + 1n}`);
    await waitL1Block();

    test.logger.info(`Voting`);
    const voteTx = await rollup.vote(l1TxUtils, 0n);
    expect(voteTx.receipt?.status).toBe('success');
    test.logger.info(`Voted`);

    const proposalState = await governance.read.getProposal([0n]);
    test.logger.info(`Proposal state`, proposalState);

    const timeToExecutable = timeToActive + proposal.config.votingDuration + proposal.config.executionDelay + 1n;
    test.logger.info(`Warping to ${timeToExecutable}`);
    await test.context.cheatCodes.eth.warp(Number(timeToExecutable));
    test.logger.info(`Warped to ${timeToExecutable}`);
    await waitL1Block();

    test.logger.info(`Checking governance proposer`);
    expect(await governance.read.governanceProposer()).toEqual(
      getAddress(test.context.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString()),
    );
    test.logger.info(`Governance proposer is correct`);

    test.logger.info(`Executing proposal`);
    const executeTx = await governance.write.execute([0n], { account: emperor });
    await test.context.deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash: executeTx });
    test.logger.info(`Executed proposal`);
    const newGovernanceProposer = await governance.read.governanceProposer();
    expect(newGovernanceProposer).not.toEqual(
      getAddress(test.context.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString()),
    );
    expect(await governance.read.getProposalState([0n])).toEqual(5);
    test.logger.info(`Governance proposer is correct`);
  }, 1_000_000);
});
