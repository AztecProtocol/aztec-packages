import type { AztecNodeService } from '@aztec/aztec-node';
import { retryUntil, sleep } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum';
import { SlashFactoryAbi, SlasherAbi, SlashingProposerAbi } from '@aztec/l1-artifacts';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getAddress, getContract } from 'viem';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';

jest.setTimeout(1000000);

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'slashing-'));

// This test is showcasing that slashing can happen, abusing that our nodes are honest but stupid
// making them slash themselves.
// TODO: this test looks to slash attesters because ANY epoch was pruned.
// But soon (TODO(#14407), TODO(#14408)) we will only slash epoch prune due to data withholding OR
// the data was available and the epoch could have been proven.
describe('e2e_p2p_slashing', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  const slashingQuorum = 3;
  const slashingRoundSize = 5;
  const slashingAmount = 1n + 50n * 10n ** 18n;
  const aztecSlotDuration = 12;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_slashing',
      numberOfNodes: NUM_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        listenAddress: '127.0.0.1',
        aztecEpochDuration: 1,
        ethereumSlotDuration: 4,
        aztecSlotDuration,
        aztecProofSubmissionWindow: 1,
        slashingQuorum,
        slashingRoundSize,
        slashPrunePenalty: slashingAmount,
        slashPruneMaxPenalty: slashingAmount,
      },
    });

    await t.setupAccount();
    await t.applyBaseSnapshots();
    await t.setup();
    await t.removeInitialNode();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('should slash the attesters', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    const rollup = new RollupContract(
      t.ctx.deployL1ContractsValues!.l1Client,
      t.ctx.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
    );

    const slasherContract = getContract({
      address: getAddress(await rollup.getSlasher()),
      abi: SlasherAbi,
      client: t.ctx.deployL1ContractsValues.l1Client,
    });

    const slashingProposer = getContract({
      address: getAddress(await slasherContract.read.PROPOSER()),
      abi: SlashingProposerAbi,
      client: t.ctx.deployL1ContractsValues.l1Client,
    });

    const slashFactory = getContract({
      address: getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.slashFactoryAddress!.toString()),
      abi: SlashFactoryAbi,
      client: t.ctx.deployL1ContractsValues.l1Client,
    });

    const debugRollup = async () => {
      await t.ctx.cheatCodes.rollup.debugRollup();
    };

    t.ctx.aztecNodeConfig.validatorReexecute = false;
    t.ctx.aztecNodeConfig.minTxsPerBlock = 0;

    // Jump forward to an epoch in the future such that the validator set is not empty
    await t.ctx.cheatCodes.rollup.advanceToEpoch(4n);
    // Send tx
    await t.sendDummyTx();

    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.
    t.logger.info('Creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    await debugRollup();

    // wait a bit for peers to discover each other
    await sleep(4000);

    await debugRollup();

    // Produce blocks until we hit an issue with pruning.
    // Then we should jump in time to the next round so we are sure that we have the votes
    // Then we just sit on our hands and wait.

    const seqClient = nodes[0].getSequencer();
    if (!seqClient) {
      throw new Error('Sequencer not found');
    }

    await debugRollup();

    t.logger.info(`Waiting for committee to be set`);
    let committee: readonly `0x${string}`[] = [];
    await retryUntil(
      async () => {
        committee = await rollup.getCurrentEpochCommittee();
        return committee.length > 0;
      },
      'non-empty committee',
      60,
    );
    await debugRollup();

    t.logger.info(`Waiting for slash payload to be deployed`);
    const expectedSlashes = Array.from({ length: committee.length }, () => slashingAmount);
    t.logger.info(`Expected slashes: ${expectedSlashes}`);
    const sortedCommittee = [...committee].sort((a, b) => a.localeCompare(b));
    await retryUntil(
      async () => {
        const [address, _, isDeployed] = await slashFactory.read.getAddressAndIsDeployed([
          sortedCommittee,
          expectedSlashes,
        ]);
        return address && isDeployed;
      },
      'slash payload deployed',
      60,
      1,
    );

    const attestersPre = await rollup.getAttesters();
    expect(attestersPre.length).toBe(committee.length);

    for (const attester of attestersPre) {
      const attesterInfo = await rollup.getAttesterView(attester);
      // Check that status isValidating
      expect(attesterInfo.status).toEqual(1);
    }

    t.logger.info(`Waiting for slash proposal to be executed`);
    await retryUntil(
      async () => {
        const events = await slashingProposer.getEvents.ProposalExecuted();
        if (events.length === 0) {
          return false;
        }
        const event = events[0];
        const roundNumber = event.args.round;
        const proposal = event.args.proposal;
        return roundNumber && proposal;
      },
      'proposal executed',
      slashingRoundSize * 2 * aztecSlotDuration,
      1,
    );

    // The attesters should still form the committee
    // but they should be reduced to the "living" status
    await debugRollup();
    const committeePostSlashing = await rollup.getCurrentEpochCommittee();
    expect(committeePostSlashing.length).toBe(attestersPre.length);

    const attestersPostSlashing = await rollup.getAttesters();
    expect(attestersPostSlashing.length).toBe(0);

    for (const attester of attestersPre) {
      const attesterInfo = await rollup.getAttesterView(attester);
      // Check that status is Living
      expect(attesterInfo.status).toEqual(2);
    }

    await t.ctx.cheatCodes.rollup.advanceToNextEpoch();
    await t.sendDummyTx();
    await debugRollup();

    const committeeNextEpoch = await rollup.getCurrentEpochCommittee();
    expect(committeeNextEpoch.length).toBe(0);

    const attestersNextEpoch = await rollup.getAttesters();
    expect(attestersNextEpoch.length).toBe(0);
  }, 1_000_000);
});
