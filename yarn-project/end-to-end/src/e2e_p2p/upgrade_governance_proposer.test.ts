import type { AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';
import { L1TxUtils, RollupContract, deployL1Contract } from '@aztec/ethereum';
import {
  GovernanceAbi,
  GovernanceProposerAbi,
  NewGovernanceProposerPayloadAbi,
  NewGovernanceProposerPayloadBytecode,
} from '@aztec/l1-artifacts';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getAddress, getContract } from 'viem';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES } from './p2p_network.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;
// Note: these ports must be distinct from the other e2e tests, else the tests will
// interfere with each other.
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'upgrade-'));

jest.setTimeout(1000 * 60 * 10);

/**
 * This tests emulate the same test as in l1-contracts/test/governance/scenario/UpgradeGovernanceProposerTest.t.sol
 * but it does so in an end-to-end manner with multiple "real" nodes.
 */
describe('e2e_p2p_governance_proposer', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let l1TxUtils: L1TxUtils;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_gerousia',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up`
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        listenAddress: '127.0.0.1',
        governanceProposerQuorum: 6,
        governanceProposerRoundSize: 10,
        depositAmount: 10n ** 22n,
        minimumStake: 5n ** 22n,
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();

    l1TxUtils = new L1TxUtils(t.ctx.deployL1ContractsValues.l1Client);
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('Should cast votes to upgrade governanceProposer', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    const governanceProposer = getContract({
      address: getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString()),
      abi: GovernanceProposerAbi,
      client: t.ctx.deployL1ContractsValues.l1Client,
    });

    const roundSize = await governanceProposer.read.M();

    const governance = getContract({
      address: getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceAddress.toString()),
      abi: GovernanceAbi,
      client: t.ctx.deployL1ContractsValues.l1Client,
    });

    const rollup = new RollupContract(
      t.ctx.deployL1ContractsValues!.l1Client,
      t.ctx.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
    );

    const gseAddress = await rollup.getGSE();

    const waitL1Block = async () => {
      await l1TxUtils.sendAndMonitorTransaction({
        to: emperor.address,
        value: 1n,
      });
    };

    const nextRoundTimestamp = await rollup.getTimestampForSlot(
      ((await rollup.getSlotNumber()) / roundSize) * roundSize + roundSize,
    );
    await t.ctx.cheatCodes.eth.warp(Number(nextRoundTimestamp));

    const { address: newPayloadAddress } = await deployL1Contract(
      t.ctx.deployL1ContractsValues.l1Client,
      NewGovernanceProposerPayloadAbi,
      NewGovernanceProposerPayloadBytecode,
      [t.ctx.deployL1ContractsValues.l1ContractAddresses.registryAddress.toString(), gseAddress],
    );

    t.logger.info(`Deployed new payload at ${newPayloadAddress}`);

    const emperor = t.ctx.deployL1ContractsValues.l1Client.account;

    const govInfo = async () => {
      const bn = await t.ctx.cheatCodes.eth.blockNumber();
      const slot = await rollup.getSlotNumber();
      const round = await governanceProposer.read.computeRound([slot]);

      const info = await governanceProposer.read.getRoundData([
        t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round,
      ]);
      const leaderVotes = await governanceProposer.read.yeaCount([
        t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round,
        info.leader,
      ]);
      t.logger.info(
        `Governance stats for round ${round} (Slot: ${slot}, BN: ${bn}). Leader: ${info.leader} have ${leaderVotes} votes`,
      );
      return { bn, slot, round, info, leaderVotes };
    };

    await waitL1Block();

    const govBefore = await govInfo();

    t.logger.info('Creating nodes');
    nodes = await createNodes(
      { ...t.ctx.aztecNodeConfig, governanceProposerPayload: newPayloadAddress },
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      shouldCollectMetrics(),
    );

    await sleep(4000);

    t.logger.info('Start progressing time to cast votes');
    const quorumSize = await governanceProposer.read.N();
    t.logger.info(`Quorum size: ${quorumSize}, round size: ${await governanceProposer.read.M()}`);

    let govData;
    while (true) {
      govData = await govInfo();
      if (govData.leaderVotes >= quorumSize) {
        break;
      }
      await sleep(12000);
    }

    expect(govData.leaderVotes).toBeGreaterThan(govBefore.leaderVotes);

    const nextRoundTimestamp2 = await rollup.getTimestampForSlot(
      ((await rollup.getSlotNumber()) / roundSize) * roundSize + roundSize,
    );
    t.logger.info(`Warping to ${nextRoundTimestamp2}`);
    await t.ctx.cheatCodes.eth.warp(Number(nextRoundTimestamp2));

    await waitL1Block();

    t.logger.info(`Executing proposal ${govData.round}`);
    const txHash = await governanceProposer.write.executeProposal([govData.round], {
      account: emperor,
      gas: 1_000_000n,
    });
    await t.ctx.deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash: txHash });
    t.logger.info(`Executed proposal ${govData.round}`);

    const proposal = await governance.read.getProposal([0n]);

    const timeToActive = proposal.creation + proposal.config.votingDelay;
    t.logger.info(`Warping to ${timeToActive + 1n}`);
    await t.ctx.cheatCodes.eth.warp(Number(timeToActive + 1n));
    t.logger.info(`Warped to ${timeToActive + 1n}`);
    await waitL1Block();

    t.logger.info(`Voting`);
    const voteTx = await rollup.vote(l1TxUtils, 0n);
    expect(voteTx.receipt?.status).toBe('success');
    t.logger.info(`Voted`);

    const proposalState = await governance.read.getProposal([0n]);
    t.logger.info(`Proposal state`, proposalState);
    400000000000000000000;
    const timeToExecutable = timeToActive + proposal.config.votingDuration + proposal.config.executionDelay + 1n;
    t.logger.info(`Warping to ${timeToExecutable}`);
    await t.ctx.cheatCodes.eth.warp(Number(timeToExecutable));
    t.logger.info(`Warped to ${timeToExecutable}`);
    await waitL1Block();

    t.logger.info(`Checking governance proposer`);
    expect(await governance.read.governanceProposer()).toEqual(
      getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString()),
    );
    t.logger.info(`Governance proposer is correct`);

    t.logger.info(`Executing proposal`);
    const executeTx = await governance.write.execute([0n], { account: emperor });
    await t.ctx.deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash: executeTx });
    t.logger.info(`Executed proposal`);
    const newGovernanceProposer = await governance.read.governanceProposer();
    expect(newGovernanceProposer).not.toEqual(
      getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString()),
    );
    expect(await governance.read.getProposalState([0n])).toEqual(5);
    t.logger.info(`Governance proposer is correct`);
  }, 1_000_000);
});
