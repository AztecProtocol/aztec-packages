/**
 * HA work-distribution resilience test.
 *
 * Extracted from `e2e_ha_full.parallel.test.ts`: this test kills each block's producer node in turn, so it
 * leaves the cluster unusable and previously carried a "must run last" ordering contract. Giving it its
 * own file (and therefore its own cluster via the shared `HaFullTestContext`) removes that contract while
 * preserving every assertion. Requires the docker-compose HA suite (run_test.sh ha).
 */
import { type AttestationInfo, getAttestationInfoFromPublishedCheckpoint } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { OffenseType } from '@aztec/stdlib/slashing';

import { jest } from '@jest/globals';

import { getValidatorDuties, verifyNoDuplicateAttestations } from '../../fixtures/ha_setup.js';
import { COMMITTEE_SIZE, HaFullTestContext, NODE_COUNT } from './ha_full_setup.js';

describe('HA Distribute Work', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  const t = new HaFullTestContext();

  beforeAll(async () => {
    await t.setup();
  });

  afterAll(async () => {
    await t.teardown();
  });

  it('should distribute work across multiple HA nodes', async () => {
    const { logger, haNodeServices, sendTriggerTx, aztecNode, mainPool, getSignatureContext, stopHANode } = t;

    logger.info('Testing HA resilience by killing nodes after they produce blocks');

    // We'll produce NODE_COUNT blocks (5 total with NODE_COUNT=5)
    // Each node produces exactly 1 block, and we kill it after it produces
    // The last remaining node will produce the final block
    const blockCount = NODE_COUNT;
    const receipts = [];
    const killedNodes: number[] = []; // Track indices of killed nodes
    const blockProducers = new Map<number, string>(); // Map block index to node ID
    let previousBlockNumber: number | undefined;

    const nodeIds: string[] = [];
    for (const service of haNodeServices) {
      nodeIds.push((await service.getConfig()).nodeId);
    }

    for (let i = 0; i < blockCount; i++) {
      logger.info(`\n=== Producing block ${i + 1}/${blockCount} ===`);
      logger.info(`Active nodes: ${haNodeServices.length - killedNodes.length}/${NODE_COUNT}`);

      const receipt = await sendTriggerTx();

      expect(receipt.blockNumber).toBeDefined();

      // Verify this transaction is in a different block than the previous one
      if (previousBlockNumber !== undefined) {
        expect(receipt.blockNumber).toBeGreaterThan(previousBlockNumber);
      }

      previousBlockNumber = receipt.blockNumber;
      receipts.push(receipt);

      // Find which node produced this block
      const [block] = await aztecNode.getBlocks(receipt.blockNumber!, 1, {
        includeL1PublishInfo: true,
        includeAttestations: true,
        includeTransactions: true,
        onlyCheckpointed: true,
      });
      if (!block) {
        throw new Error(`Block ${receipt.blockNumber} not found`);
      }
      const slotNumber = BigInt(block.header.globalVariables.slotNumber);
      const duties = await getValidatorDuties(mainPool, slotNumber);
      const blockProposalDuty = duties.find(d => d.dutyType === 'BLOCK_PROPOSAL');

      if (!blockProposalDuty) {
        throw new Error(`No block proposal duty found for slot ${slotNumber}`);
      }

      blockProducers.set(i, blockProposalDuty.nodeId);
      logger.info(`Block ${receipt.blockNumber} produced by node ${blockProposalDuty.nodeId}`);

      const producerNodeId = blockProposalDuty.nodeId;
      const producerNodeIndex = nodeIds.findIndex(nodeId => nodeId === producerNodeId);

      if (producerNodeIndex === -1) {
        throw new Error(`Could not find active node with ID ${producerNodeId}`);
      }

      // Kill the node that produced this block, unless it's the last block
      if (i < blockCount - 1) {
        logger.info(`Killing node ${producerNodeId} that produced this block`);
        await stopHANode(producerNodeIndex);
        killedNodes.push(producerNodeIndex);
      } else {
        // The final survivor is kept online for the slash-offense assertion below, but its sequencer
        // is no longer needed. Stop it before running the remaining assertions so it cannot start a
        // new empty checkpoint and then block service shutdown while awaiting a delayed L1 publish.
        logger.info(`Last block produced; stopping sequencer for survivor ${producerNodeId}`);
        await haNodeServices[producerNodeIndex].getSequencer()?.stop();
      }

      logger.info(`Block ${i + 1}/${blockCount} completed. Killed nodes: ${killedNodes.length}/${NODE_COUNT}`);
    }

    // Verify we got the expected number of distinct blocks
    const blockNumbers = receipts.map(r => r.blockNumber!).sort((a, b) => a - b);
    const uniqueBlockNumbers = new Set(blockNumbers);
    expect(uniqueBlockNumbers.size).toBe(blockCount);
    logger.info(`Created ${uniqueBlockNumbers.size} distinct blocks: ${Array.from(uniqueBlockNumbers).join(', ')}`);

    // Verify each node produced at least 1 block
    const nodeBlockCounts = new Map<string, number>();
    for (const nodeId of blockProducers.values()) {
      const count = nodeBlockCounts.get(nodeId) || 0;
      nodeBlockCounts.set(nodeId, count + 1);
    }

    logger.info(`Block production by node: ${JSON.stringify(Array.from(nodeBlockCounts.entries()))}`);

    // Verify: each node should have produced at least 1 block
    // (there may be empty blocks produced during node transitions)
    for (const [nodeId, count] of nodeBlockCounts.entries()) {
      expect(count).toBeGreaterThanOrEqual(1);
      logger.info(`Node ${nodeId} produced ${count} block(s) as expected`);
    }

    // Verify all nodes participated (NODE_COUNT nodes total)
    expect(nodeBlockCounts.size).toBe(NODE_COUNT);
    logger.info(`All ${NODE_COUNT} nodes participated in block production`);

    // Verify no double-signing occurred across all blocks
    const quorum = Math.floor((COMMITTEE_SIZE * 2) / 3) + 1;
    for (const receipt of receipts) {
      const [block] = await aztecNode.getBlocks(receipt.blockNumber!, 1, {
        includeL1PublishInfo: true,
        includeAttestations: true,
        includeTransactions: true,
        onlyCheckpointed: true,
      });
      if (!block) {
        throw new Error(`Block ${receipt.blockNumber} not found`);
      }
      const slotNumber = BigInt(block.header.globalVariables.slotNumber);

      // PRIMARY CHECK: Database records show all attestation duties attempted/completed
      const duties = await getValidatorDuties(mainPool, slotNumber);
      const attestationDuties = duties.filter(d => d.dutyType === 'ATTESTATION');

      // Verify no duplicate attestation duties per validator (HA protection ensures 1 per validator)
      const dutiesByValidator = verifyNoDuplicateAttestations(attestationDuties, logger);
      expect(dutiesByValidator.size).toBeGreaterThanOrEqual(quorum);
      logger.info(
        `Block ${receipt.blockNumber}: Database shows ${dutiesByValidator.size} unique validators attested (quorum: ${quorum}), no double-signing detected in DB`,
      );

      // SECONDARY CHECK: Verify checkpoint attestations match database records
      const [publishedCheckpoint] = await aztecNode.getCheckpoints(block.checkpointNumber, 1, {
        includeAttestations: true,
      });
      const attestationInfos = getAttestationInfoFromPublishedCheckpoint(
        {
          attestations: publishedCheckpoint.attestations ?? [],
          checkpoint: new Checkpoint(
            publishedCheckpoint.archive,
            publishedCheckpoint.header,
            [],
            publishedCheckpoint.number,
            publishedCheckpoint.feeAssetPriceModifier,
          ),
        },
        getSignatureContext(),
      );

      // Filter to only valid attestations with recovered addresses
      const validAttestations = attestationInfos.filter(
        (info: AttestationInfo) => info.status === 'recovered-from-signature' && info.address !== undefined,
      );

      // Verify checkpoint has exactly quorum attestations (trimmed to minimum required)
      const checkpointValidatorAddresses = new Set<string>(validAttestations.map(info => info.address!.toString()));
      expect(checkpointValidatorAddresses.size).toBe(quorum);

      // Verify every validator in the checkpoint has a corresponding DB duty record
      // (checkpoint is trimmed to quorum, so it's a subset of DB records)
      for (const validatorAddress of checkpointValidatorAddresses) {
        expect(dutiesByValidator.has(validatorAddress)).toBe(true);
      }
    }

    // GOSSIP-LAYER CHECK: each HA node's libp2p service detects when a signer attests to two
    // distinct payloads at the same slot and fires `duplicateAttestationCallback` -> validator
    // client emits WANT_TO_SLASH_EVENT -> SlashOffensesCollector persists a DUPLICATE_ATTESTATION
    // offense. We assert no such offense (or DUPLICATE_PROPOSAL) was collected on any surviving
    // HA node. Killed nodes are unreachable, but the surviving node — which has been alive the
    // whole test — has observed all gossiped attestations and proposals across every slot.
    const aliveNodes = haNodeServices.filter((_, idx) => !killedNodes.includes(idx));
    const allOffenses = (await Promise.all(aliveNodes.map(n => n.getSlashOffenses('all')))).flat();
    const equivocationOffenses = allOffenses.filter(
      o => o.offenseType === OffenseType.DUPLICATE_ATTESTATION || o.offenseType === OffenseType.DUPLICATE_PROPOSAL,
    );
    expect(equivocationOffenses).toEqual([]);

    await Promise.all(haNodeServices.map((_, nodeIndex) => stopHANode(nodeIndex)));
  });
});
