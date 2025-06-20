import type { AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';
import { L1TxUtils, RollupContract } from '@aztec/ethereum';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { RollupAbi, SlashFactoryAbi, SlasherAbi, SlashingProposerAbi } from '@aztec/l1-artifacts';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { encodeFunctionData, getAddress, getContract, parseEventLogs } from 'viem';

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
describe('e2e_p2p_slashing', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let l1TxUtils: L1TxUtils;

  const slashingQuorum = 3;
  const slashingRoundSize = 5;
  const slashingAmount = 1n;

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
        aztecSlotDuration: 12,
        aztecProofSubmissionWindow: 1,
        slashingQuorum,
        slashingRoundSize,
      },
    });

    await t.setupAccount();
    await t.applyBaseSnapshots();
    await t.setup();
    await t.removeInitialNode();

    l1TxUtils = new L1TxUtils(t.ctx.deployL1ContractsValues.l1Client);
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

    const getRoundAndSlotNumber = async () => {
      const slotNumber = await rollup.getSlotNumber();
      return { roundNumber: await slashingProposer.read.computeRound([slotNumber]), slotNumber };
    };

    const debugRollup = async () => {
      await t.ctx.cheatCodes.rollup.debugRollup();
    };

    /**
     * Get the slashing info for a given round number.
     * @param roundNumber - The round number to get the slashing info for.
     * @returns The current block number, current slot number and the slashing info.
     */
    const slashingInfo = async (roundNumber: bigint) => {
      const instanceAddress = t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString();
      const info = await slashingProposer.read.rounds([instanceAddress, roundNumber]);
      const leaderVotes = await slashingProposer.read.yeaCount([instanceAddress, roundNumber, info[1]]);
      const bn = await t.ctx.cheatCodes.eth.blockNumber();
      const slotNumber = await rollup.getSlotNumber();
      return { bn, slotNumber, roundNumber, info, leaderVotes };
    };

    const waitUntilNextRound = async () => {
      t.logger.info(`Waiting for next round`);
      const roundSize = await slashingProposer.read.M();
      const currentRound = (await rollup.getSlotNumber()) / roundSize;
      const nextRoundSlot = currentRound * roundSize + roundSize;
      while ((await rollup.getSlotNumber()) < nextRoundSlot) {
        await sleep(1000);
      }
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

    // We are overriding the slashing amount to 1, such that the slashing will "really" happen.
    for (const node of nodes) {
      const seqClient = node.getSequencer();
      if (!seqClient) {
        throw new Error('Sequencer not found');
      }
      const sequencer = (seqClient as any).sequencer;
      const slasher = (sequencer as any).slasherClient;
      slasher.slashingAmount = slashingAmount;
    }

    await debugRollup();

    // wait a bit for peers to discover each other
    await sleep(4000);

    const votesNeeded = await slashingProposer.read.N();

    await debugRollup();

    // Produce blocks until we hit an issue with pruning.
    // Then we should jump in time to the next round so we are sure that we have the votes
    // Then we just sit on our hands and wait.

    const seqClient = nodes[0].getSequencer();
    if (!seqClient) {
      throw new Error('Sequencer not found');
    }
    const sequencer = (seqClient as any).sequencer;
    const slasher = (sequencer as any).slasherClient;
    let slashEvents: any[] = [];

    await debugRollup();

    t.logger.info(`Producing blocks until we hit a pruning event`);

    await debugRollup();

    // Run for up to the slashing round size, or as long as needed to get a slash event
    // Variable because sometimes hit race-condition issues with attestations.
    for (let i = 0; i < slashingRoundSize; i++) {
      const bn = await nodes[0].getBlockNumber();

      t.logger.info(`Waiting for block number to change`);
      while (bn === (await nodes[0].getBlockNumber())) {
        await sleep(1000);
      }

      // Create a clone of slasher.slashEvents to prevent race conditions
      // The validator client can remove elements from the original array
      slashEvents = [...slasher.slashEvents];
      t.logger.info(`Slash events: ${slashEvents.length}`);
      t.logger.info(`Slash events: ${jsonStringify(slashEvents)}`);
      if (slashEvents.length > 0) {
        t.logger.info(`We have a slash event ${i}`);
        break;
      }
    }

    await debugRollup();

    expect(slashEvents.length).toBeGreaterThan(0);
    await waitUntilNextRound();

    // Get the round number where we expect to be seeing a bunch of votes.
    const { roundNumber, slotNumber } = await getRoundAndSlotNumber();
    let sInfo = await slashingInfo(roundNumber);

    await debugRollup();

    // For the next round we will try to cast votes.
    // Stop early if we have enough votes.
    t.logger.info(`Waiting for votes to be cast`);
    for (let i = 0; i < slashingRoundSize; i++) {
      t.logger.info(`Waiting for block number to change`);
      const slotNumber = await rollup.getSlotNumber();
      while (slotNumber === (await rollup.getSlotNumber())) {
        await sleep(1000);
      }

      sInfo = await slashingInfo(roundNumber);
      t.logger.info(`We have ${sInfo.leaderVotes} votes in round ${sInfo.roundNumber} on ${sInfo.info[1]}`);
      if (sInfo.leaderVotes >= votesNeeded) {
        // We need there to be an actual committee to slash for this round
        const epoch = await rollup.getEpochNumberForSlotNumber(sInfo.slotNumber);
        const committee = await rollup.getEpochCommittee(epoch);
        if (committee.length > 0) {
          t.logger.info(`We have sufficient votes, and a committee for epoch ${epoch}`);
          break;
        } else {
          t.logger.info(`No committee found for epoch ${epoch}, waiting for next round`);
        }
      }
    }

    // Because of race-conditions when we start we cannot ACTUALLY rely on just the first slash event
    // of the first node, since the nodes might get online at different times and don't agree on this.
    // e.g., the first slash could happen before the second node even got online.
    // Therefore we derive what we are actually looking for based on what people voted on.
    // Normally, one of the agents voting should be making the slash happen, but right now,
    // we don't have that in place.
    const targetAddress = sInfo.info[1];

    await debugRollup();

    let targetEpoch = 0n;
    for (let i = 0; i <= slotNumber; i++) {
      const epoch = await rollup.getEpochNumberForSlotNumber(BigInt(i));
      const [address, isDeployed] = await slashFactory.read.getAddressAndIsDeployed([epoch, slashingAmount]);
      if (address === targetAddress && !isDeployed) {
        targetEpoch = epoch;
        t.logger.info(`Target epoch found: ${targetEpoch}`);
        break;
      }
    }

    await debugRollup();

    await l1TxUtils.sendAndMonitorTransaction({
      to: slashFactory.address,
      data: encodeFunctionData({
        abi: SlashFactoryAbi,
        functionName: 'createSlashPayload',
        args: [targetEpoch, slashingAmount],
      }),
    });

    await debugRollup();

    t.logger.info(`Slash payload for ${targetEpoch}, ${slashingAmount} deployed at ${targetAddress}`);
    t.logger.info(
      `Committee for epoch ${targetEpoch}: ${(await rollup.getEpochCommittee(targetEpoch)).map(addr =>
        addr.toLowerCase(),
      )}`,
    );

    await debugRollup();

    t.logger.info(`We wait until next round to execute the payload`);
    await waitUntilNextRound();
    const attestersPre = await rollup.getAttesters();

    for (const attester of attestersPre) {
      const attesterInfo = await rollup.getInfo(attester);
      // Check that status isValidating
      expect(attesterInfo.status).toEqual(1);
    }

    t.logger.info(`Execute payload for ${sInfo.roundNumber} at ${sInfo.info[1]}, SLASHING!`);

    const { result } = await t.ctx.deployL1ContractsValues.l1Client.simulateContract({
      address: getAddress(slashingProposer.address),
      abi: SlashingProposerAbi,
      functionName: 'executeProposal',
      args: [sInfo.roundNumber],
    });
    t.logger.info(`Result: `, result);

    const { receipt } = await l1TxUtils.sendAndMonitorTransaction({
      to: slashingProposer.address,
      data: encodeFunctionData({
        abi: SlashingProposerAbi,
        functionName: 'executeProposal',
        args: [sInfo.roundNumber],
      }),
    });

    t.logger.info(`Performed slash in ${receipt.transactionHash}`);

    await debugRollup();

    const slashingEvents = parseEventLogs({
      abi: RollupAbi,
      logs: receipt.logs,
    }).filter(log => log.eventName === 'Slashed');

    const attestersSlashed = slashingEvents.map(event => {
      // Because TS is a little nagging bitch
      return (event.args as any).attester;
    });

    t.logger.info(`Attesters slashed: ${attestersSlashed.map(addr => addr.toLowerCase())}`);

    // Convert attestersPre elements to lowercase for consistent comparison
    const normalizedAttestersPre = attestersPre.map(addr => addr.toLowerCase());
    const normalizedAttestersSlashed = attestersSlashed.map(addr => addr.toLowerCase());
    expect(new Set(normalizedAttestersPre)).toEqual(new Set(normalizedAttestersSlashed));

    const instanceAddress = t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString();
    const infoPost = await slashingProposer.read.rounds([instanceAddress, sInfo.roundNumber]);

    expect(sInfo.info[1]).toEqual(infoPost[1]);
    expect(sInfo.info[2]).toEqual(false);
    expect(infoPost[2]).toEqual(true);

    const attestersPost = await rollup.getAttesters();

    // Attesters next epoch
    await t.ctx.cheatCodes.rollup.advanceToNextEpoch();
    // Send tx
    await t.sendDummyTx();

    for (const attester of attestersPre) {
      const attesterInfo = await rollup.getInfo(attester);
      // Check that status is Living
      expect(attesterInfo.status).toEqual(2);
    }

    await debugRollup();

    // Committee should only update in the next epoch
    const committee = await rollup.getEpochCommittee(targetEpoch);
    expect(attestersPre.length).toBe(committee.length);
    expect(attestersPost.length).toBe(0);
  }, 1_000_000);
});
