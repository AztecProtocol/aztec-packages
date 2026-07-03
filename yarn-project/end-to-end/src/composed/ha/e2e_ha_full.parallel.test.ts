/**
 * High-Availability Full E2E Test
 *
 * Tests a complete HA setup with multiple nodes coordinating via PostgreSQL
 * and Web3Signer for remote signing. Verifies that blocks are produced,
 * attestations are signed, and no double-signing occurs.
 *
 * The cluster setup lives in `ha_full_setup.ts` and is shared with
 * `e2e_ha_distribute_work.parallel.test.ts`. The node-killing "distribute work" resilience test lives in
 * that separate file so it gets its own cluster instead of relying on running last, and the clock-skew /
 * timezone DB assertions moved to the cheap in-process `multi-node/high-availability/clock_skew.test.ts`.
 */
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { GovernanceProposerAbi } from '@aztec/l1-artifacts/GovernanceProposerAbi';
import type { ValidatorClient } from '@aztec/validator-client';
import { type DutyRow, DutyStatus } from '@aztec/validator-ha-signer/types';

import { jest } from '@jest/globals';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getValidatorDuties, verifyNoDuplicateAttestations } from '../../fixtures/ha_setup.js';
import {
  COMMITTEE_SIZE,
  HaFullTestContext,
  NODE_COUNT,
  VALIDATOR_COUNT,
  submitTriggerTx,
  waitForTriggerTx,
} from './ha_full_setup.js';

describe('HA Full Setup', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  const t = new HaFullTestContext();

  beforeAll(async () => {
    await t.setup();
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    // Restore any mocked functions
    jest.restoreAllMocks();

    // Clean up database state between tests
    await t.resetDutiesTable();
  });

  it('should produce blocks with HA coordination and attestations', async () => {
    const { logger, wallet, testContract, ownerAddress, aztecNode, mainPool, haNodeServices, startHASequencers } = t;

    logger.info('Testing full HA setup: block production, attestations, and coordination');

    // Send a tx to trigger block building. The account and contract are funded/registered at genesis,
    // so HA validators are the first block producers exercised by this suite.
    logger.info(`Sending trigger tx from ${ownerAddress}`);
    const txHash = await submitTriggerTx(wallet, testContract, ownerAddress);
    await startHASequencers();
    const receipt = await waitForTriggerTx(aztecNode, txHash);

    expect(receipt.blockNumber).toBeDefined();
    logger.info(`Trigger tx checkpointed in block ${receipt.blockNumber}`);

    // Get the block with attestations
    const [block] = await aztecNode.getBlocks(receipt.blockNumber!, 1, {
      includeL1PublishInfo: true,
      includeAttestations: true,
      includeTransactions: true,
      onlyCheckpointed: true,
    });
    if (!block) {
      throw new Error(`Block ${receipt.blockNumber} not found`);
    }

    // Verify txs were included in the block (tests full signing path)
    expect(block.body!.txEffects.length).toBeGreaterThan(0);
    logger.info(`Block contains ${block.body!.txEffects.length} transaction(s)`);

    // get attestations from checkpoint
    const [checkpoint] = await aztecNode.getCheckpoints(block.checkpointNumber, 1, { includeAttestations: true });
    const attestations = (checkpoint.attestations ?? []).filter(a => !a.signature.isEmpty());

    // Should have enough attestations for quorum
    const quorum = Math.floor((COMMITTEE_SIZE * 2) / 3) + 1;
    expect(attestations.length).toBeGreaterThanOrEqual(quorum);
    logger.info(`Found ${attestations.length} attestations (quorum: ${quorum})`);

    // Verify signatures are valid (signed by Web3Signer)
    for (const attestation of attestations) {
      expect(attestation.signature.isEmpty()).toBe(false);
      expect(attestation.signature.r).toBeDefined();
      expect(attestation.signature.s).toBeDefined();
      expect(attestation.signature.v).toBeDefined();
    }
    logger.info(`Verified ${attestations.length} signatures from Web3Signer`);

    // Query database to verify HA coordination
    const slotNumber = BigInt(block.header.globalVariables.slotNumber);
    logger.info(`Querying duties for slot ${slotNumber} (block ${receipt.blockNumber})`);
    const allDuties = await getValidatorDuties(mainPool, slotNumber);
    expect(allDuties.length).toBeGreaterThan(0);
    logger.info(`Found ${allDuties.length} total duties in database`);

    // Check block proposal duty
    const blockProposalDuties = allDuties.filter(d => d.dutyType === 'BLOCK_PROPOSAL');
    expect(blockProposalDuties.length).toBe(1); // Only one node should propose
    expect(blockProposalDuties[0].completedAt).toBeDefined();
    logger.info(`Block proposed by node ${blockProposalDuties[0].nodeId}`);

    // Check that checkpoint proposal duty was also recorded (separate from block proposal)
    const checkpointProposalDuties = allDuties.filter(d => d.dutyType === 'CHECKPOINT_PROPOSAL');
    expect(checkpointProposalDuties.length).toBe(1);
    logger.info(`Found ${checkpointProposalDuties.length} checkpoint proposal duty`);

    // Check attestation duties
    // All validators attest (tracked in DB), but the checkpoint posted to L1 is trimmed to quorum.
    const attestationDuties = allDuties.filter(d => d.dutyType === 'ATTESTATION');
    expect(attestationDuties.length).toBe(VALIDATOR_COUNT);
    expect(attestations.length).toBe(quorum);
    logger.info(
      `Found ${attestationDuties.length} attestation duties, ${attestations.length} in checkpoint (quorum: ${quorum})`,
    );

    // Verify no duplicate attestations per validator (HA protection ensures 1 per validator address)
    const dutiesByValidator = verifyNoDuplicateAttestations(attestationDuties, logger);

    // Verify we got attestations from multiple validators
    expect(dutiesByValidator.size).toBeGreaterThanOrEqual(quorum);
    logger.info(`${dutiesByValidator.size} unique validators attested (quorum: ${quorum})`);

    // P2P LAYER CHECK: Verify only one attestation per validator was sent over P2P
    const p2pNode = haNodeServices[0];
    const p2p = p2pNode.getP2P();
    const slot = SlotNumber(Number(slotNumber));

    // Get all attestations from P2P pool for this slot (before deduplication)
    const p2pAttestations = await p2p.getCheckpointAttestationsForSlot(slot);
    const p2pAttestationsWithSignatures = p2pAttestations.filter(a => !a.signature.isEmpty());

    // P2P pool has attestations from all committee members; checkpoint on L1 is trimmed to quorum
    expect(p2pAttestationsWithSignatures.length).toBe(COMMITTEE_SIZE);
    const p2pValidatorAddresses = new Map<string, number>();
    for (const attestation of p2pAttestationsWithSignatures) {
      const sender = attestation.getSender();
      if (sender) {
        const addr = sender.toString();
        p2pValidatorAddresses.set(addr, (p2pValidatorAddresses.get(addr) || 0) + 1);
      }
    }

    // Verify no validator sent multiple attestations over P2P
    // Each validator should have sent exactly one attestation
    for (const [_, count] of p2pValidatorAddresses.entries()) {
      expect(count).toBe(1);
    }
  });

  it('should coordinate governance voting across HA nodes', async () => {
    const { logger, deployL1ContractsValues, haNodeServices, sendTriggerTx, aztecNode, governanceProposer, mainPool } =
      t;

    logger.info('Testing real governance voting with HA coordination');

    const mockGovernancePayload = deployL1ContractsValues.l1ContractAddresses.governanceAddress;
    logger.info(`Setting governance payload: ${mockGovernancePayload.toString()}`);

    // Configure all HA nodes to vote for this payload
    for (let i = 0; i < NODE_COUNT; i++) {
      await haNodeServices[i].setConfig({
        governanceProposerPayload: mockGovernancePayload,
      });
    }
    logger.info(`All ${NODE_COUNT} HA nodes configured to vote for governance payload`);

    // Send a transaction to trigger block building which will also trigger voting
    logger.info('Sending transaction to trigger block building...');
    const receipt = await sendTriggerTx();
    expect(receipt.blockNumber).toBeDefined();
    logger.info(`Transaction mined in block ${receipt.blockNumber}`);

    // Get the slot of the block that was just built
    const [block] = await aztecNode.getBlocks(receipt.blockNumber!, 1, {
      includeL1PublishInfo: true,
      includeAttestations: true,
      includeTransactions: true,
      onlyCheckpointed: true,
    });
    if (!block) {
      throw new Error(`Block ${receipt.blockNumber} not found`);
    }
    const blockSlot = block.header.globalVariables.slotNumber;
    logger.info(`Block was built in slot ${blockSlot}`);

    // Compute round for governance voting from the block slot
    const round = await governanceProposer.computeRound(blockSlot);
    logger.info(`Block slot ${blockSlot}, governance round ${round}`);

    // Wait for at least one on-chain governance signal for our payload to land, then assert on
    // the round *outcome* (payload-with-most-signals) rather than on a strict per-node duty
    // count equality.
    //
    // Why not assert `l1VoteCount === uniqueSlots.size` like the previous version did? HA
    // signing intentionally suppresses duplicate signatures across nodes for the same
    // `(slot, validator)` duty: only one of the N HA peers actually emits the L1 tx for each
    // scheduled slot. Under pipelining there is an additional build-slot-vs-target-slot offset
    // where a vote signed in build slot N targets slot N+1, so at any measurement time the DB
    // can have a duty row for slot S whose L1 tx hasn't mined yet. The old strict equality
    // pinned the test to behavior that doesn't hold under either of those.
    //
    // What we actually care about: the HA cluster coordinated well enough that at least one
    // successful governance signal landed for our payload, the round-winner converges on the
    // payload we configured, no duty was double-signed for the same `(slot, validator)`, and
    // every recorded duty ended in SIGNED state.
    logger.info('Polling L1 for governance signals to confirm HA cluster coordination...');
    const rollupAddr = deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString() as `0x${string}`;
    const govProposerAddr =
      deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString() as `0x${string}`;

    const { l1VoteCount, lastSignalSlot, payloadWithMostSignals } = await retryUntil(
      async () => {
        const snapshotBlock = await deployL1ContractsValues.l1Client.getBlockNumber();
        const [roundData, l1VoteCountBig] = await Promise.all([
          deployL1ContractsValues.l1Client.readContract({
            address: govProposerAddr,
            abi: GovernanceProposerAbi,
            functionName: 'getRoundData',
            args: [rollupAddr, round],
            blockNumber: snapshotBlock,
          }),
          deployL1ContractsValues.l1Client.readContract({
            address: govProposerAddr,
            abi: GovernanceProposerAbi,
            functionName: 'signalCount',
            args: [rollupAddr, round, mockGovernancePayload.toString() as `0x${string}`],
            blockNumber: snapshotBlock,
          }),
        ]);
        const lastSignalSlot = Number(roundData.lastSignalSlot);
        const l1VoteCount = Number(l1VoteCountBig);
        logger.info(
          `L1 round ${round}: lastSignalSlot=${lastSignalSlot}, l1VoteCount=${l1VoteCount}, ` +
            `payloadWithMostSignals=${roundData.payloadWithMostSignals} ` +
            `(snapshot at L1 block ${snapshotBlock})`,
        );
        if (l1VoteCount === 0) {
          return undefined;
        }
        return {
          l1VoteCount,
          lastSignalSlot,
          payloadWithMostSignals: roundData.payloadWithMostSignals,
        };
      },
      `L1 governance round to land >= 1 signal`,
      120,
      0.5,
    );

    // Outcome 1: the round leader payload is the one we configured all HA nodes to vote for.
    // This is the strongest "governance state advanced toward our payload" assertion the
    // contract exposes per-round short of executing the proposal (which needs QUORUM_SIZE
    // signals -- defaults to ~151 and takes many minutes to reach, way beyond a unit-test
    // budget).
    expect(l1VoteCount).toBeGreaterThan(0);
    expect(payloadWithMostSignals.toLowerCase()).toBe(mockGovernancePayload.toString().toLowerCase());
    logger.info(
      `Governance round ${round} coordinated on payload ${payloadWithMostSignals}: ${l1VoteCount} signals on L1`,
    );

    // Outcome 2: every duty the HA cluster recorded for this round is in a healthy state, and
    // no (slot, validator) pair was signed twice — i.e. HA dedup actually suppressed duplicates.
    // We tolerate `uniqueDutySlots > l1VoteCount` (in-flight L1 txs that haven't mined yet) and
    // `uniqueDutySlots < l1VoteCount` (duties that completed too recently to be visible at the
    // snapshot read) — the only invariant we hold is "no two HA nodes both signed the same
    // (slot, validator)".
    const dbResult = await mainPool.query<DutyRow>(
      `SELECT * FROM validator_duties WHERE slot::numeric <= $1 AND duty_type = 'GOVERNANCE_VOTE' ORDER BY slot, started_at`,
      [lastSignalSlot.toString()],
    );
    const governanceVoteDuties = dbResult.rows;

    expect(governanceVoteDuties.length).toBeGreaterThan(0);

    const dutyKeys = governanceVoteDuties.map(row => `${row.slot}-${row.validator_address}`);
    const uniqueDutyKeys = new Set(dutyKeys);
    expect(uniqueDutyKeys.size).toBe(governanceVoteDuties.length);

    for (const duty of governanceVoteDuties) {
      logger.info(
        `  Governance vote duty: slot ${duty.slot}, validator ${duty.validator_address}, node ${duty.node_id}, status ${duty.status}`,
      );
      expect(duty.status).toBe(DutyStatus.SIGNED);
      expect(duty.completed_at).toBeDefined();
    }

    const uniqueSlots = new Set(governanceVoteDuties.map(row => row.slot));
    logger.info(
      `L1 vote count: ${l1VoteCount}, governance vote duties: ${governanceVoteDuties.length}, ` +
        `unique slots with votes: ${uniqueSlots.size} (slots: ${[...uniqueSlots].join(', ')})`,
    );

    logger.info('Governance voting with HA coordination and L1 verification complete');
  });

  it('should reload keystore via admin API and keep building blocks after swapping attesters', async () => {
    const {
      logger,
      attesterAddresses,
      haKeystoreDirs,
      web3SignerUrl,
      publisherAddresses,
      initialKeystoreJsons,
      haNodeServices,
      sendTriggerTx,
      aztecNode,
    } = t;

    logger.info('Testing reloadKeystore: swap all attesters across HA nodes');

    const groupA = attesterAddresses.slice(0, 2);
    const groupB = attesterAddresses.slice(2, 4);

    const writeKeystoreForNode = async (nodeIdx: number, attesters: string[]) => {
      const ks = {
        schemaVersion: 1,
        validators: [
          {
            attester: attesters,
            feeRecipient: AztecAddress.ZERO.toString(),
            coinbase: EthAddress.fromString(attesters[0]).toChecksumString(),
            remoteSigner: web3SignerUrl,
            publisher: [publisherAddresses[nodeIdx]],
          },
        ],
      };
      await writeFile(join(haKeystoreDirs[nodeIdx], 'keystore.json'), JSON.stringify(ks, null, 2));
    };

    const verifyNodeAttesters = (nodeIdx: number, expectedAttesters: string[], label: string) => {
      const vc: ValidatorClient = (haNodeServices[nodeIdx] as any).validatorClient;
      const addrs = vc.getValidatorAddresses();
      expect(addrs).toHaveLength(expectedAttesters.length);
      for (const expected of expectedAttesters) {
        expect(addrs.some(a => a.equals(EthAddress.fromString(expected)))).toBe(true);
      }
      logger.info(`Node ${nodeIdx}: ${addrs.length} attesters (${label})`);
    };

    const quorum = Math.floor((COMMITTEE_SIZE * 2) / 3) + 1;

    try {
      // Phase 1: Nodes 0,1,2 get attesters [A0,A1], nodes 3,4 get [A2,A3]
      logger.info('Phase 1: Initial attester split');
      for (let i = 0; i < NODE_COUNT; i++) {
        await writeKeystoreForNode(i, i < 3 ? groupA : groupB);
        await haNodeServices[i].reloadKeystore();
      }
      for (let i = 0; i < NODE_COUNT; i++) {
        verifyNodeAttesters(i, i < 3 ? groupA : groupB, i < 3 ? 'group A' : 'group B');
      }

      // Phase 2: Swap — nodes 0,1,2 get [A2,A3], nodes 3,4 get [A0,A1]
      logger.info('Phase 2: Swapping all attesters');
      for (let i = 0; i < NODE_COUNT; i++) {
        await writeKeystoreForNode(i, i < 3 ? groupB : groupA);
        await haNodeServices[i].reloadKeystore();
      }
      for (let i = 0; i < NODE_COUNT; i++) {
        verifyNodeAttesters(i, i < 3 ? groupB : groupA, i < 3 ? 'group B (swapped)' : 'group A (swapped)');
      }

      const receipt = await sendTriggerTx();
      expect(receipt.blockNumber).toBeDefined();
      const [block] = await aztecNode.getBlocks(receipt.blockNumber!, 1, {
        includeL1PublishInfo: true,
        includeAttestations: true,
        includeTransactions: true,
        onlyCheckpointed: true,
      });
      const [cp] = await aztecNode.getCheckpoints(block!.checkpointNumber, 1, { includeAttestations: true });
      const att = (cp.attestations ?? []).filter(a => !a.signature.isEmpty());
      expect(att.length).toBeGreaterThanOrEqual(quorum);
      logger.info(`Phase 2: block ${receipt.blockNumber}, ${att.length} attestations (quorum ${quorum})`);
    } finally {
      // Restore each node's saved initial keystore so subsequent tests see original state
      for (let i = 0; i < NODE_COUNT; i++) {
        await writeFile(join(haKeystoreDirs[i], 'keystore.json'), initialKeystoreJsons[i]);
        await haNodeServices[i].reloadKeystore();
      }
    }
  });
});
