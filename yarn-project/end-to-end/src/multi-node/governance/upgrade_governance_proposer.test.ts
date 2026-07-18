import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import { L1TxUtils, createL1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { sleep } from '@aztec/foundation/sleep';
import { NewGovernanceProposerPayloadAbi, NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts';

import { getAddress } from 'viem';

import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MultiNodeTestContext,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';
import { GOVERNANCE_TIMING, createGovernanceTestDriver, driveGovernanceRound, jest } from './setup.js';

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
    const driver = await createGovernanceTestDriver(test, l1TxUtils);
    const { governance, rollup } = driver;

    const gseAddress = await rollup.getGSE();

    await driver.warpToNextRound();

    const { address: newPayloadAddress } = await deployL1Contract(
      test.context.deployL1ContractsValues.l1Client,
      NewGovernanceProposerPayloadAbi,
      NewGovernanceProposerPayloadBytecode,
      [test.context.deployL1ContractsValues.l1ContractAddresses.registryAddress.toString(), gseAddress.toString()],
    );
    test.logger.info(`Deployed new payload at ${newPayloadAddress}`);

    await driver.waitL1Block();

    const govBefore = await driver.govInfo();

    test.logger.info('Creating nodes');
    // Nodes are torn down by test.teardown(); they only need to be running to signal the payload.
    await Promise.all(
      Array.from({ length: NUM_VALIDATORS }, (_, i) =>
        test.createValidatorNodeAt(i, { governanceProposerPayload: newPayloadAddress }),
      ),
    );

    await sleep(4000);

    test.logger.info('Start progressing time to cast signals');
    const quorumSize = await driver.governanceProposer.read.QUORUM_SIZE();
    test.logger.info(`Quorum size: ${quorumSize}, round size: ${driver.roundSize}`);

    const { govData } = await driveGovernanceRound(driver, {
      quorumTimeoutSeconds: Number(quorumSize) * GOVERNANCE_TIMING.aztecSlotDuration * 3,
    });

    expect(govData.leaderVotes).toBeGreaterThan(govBefore.leaderVotes);

    const governanceProposerAddress = getAddress(
      test.context.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString(),
    );

    test.logger.info(`Checking governance proposer`);
    expect(await governance.read.governanceProposer()).toEqual(governanceProposerAddress);
    test.logger.info(`Governance proposer is correct`);

    test.logger.info(`Executing proposal`);
    const executeTx = await governance.write.execute([0n], { account: driver.emperor });
    await test.context.deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash: executeTx });
    test.logger.info(`Executed proposal`);
    const newGovernanceProposer = await governance.read.governanceProposer();
    expect(newGovernanceProposer).not.toEqual(governanceProposerAddress);
    expect(await governance.read.getProposalState([0n])).toEqual(5);
    test.logger.info(`Governance proposer is correct`);
  }, 1_000_000);
});
