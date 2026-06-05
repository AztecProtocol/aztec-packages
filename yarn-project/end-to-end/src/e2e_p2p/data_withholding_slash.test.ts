import type { AztecNodeService } from '@aztec/aztec-node';
import { waitForTx } from '@aztec/aztec.js/node';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { OffenseType } from '@aztec/slasher';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { awaitCommitteeExists, awaitOffenseDetected, submitTransactions } from './shared.js';

const TEST_TIMEOUT = 1_000_000;
jest.setTimeout(TEST_TIMEOUT);

// Don't set this above 9 — each node uses a distinct anvil seed for its publisher account.
const NUM_VALIDATORS = 4;
const BOOT_NODE_UDP_PORT = 4500;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * 3;
const TOLERANCE_SLOTS = 3;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'data-withholding-slash-'));

/**
 * Verifies the per-slot data-withholding slash path (A-523).
 *
 * Scenario — a realistic data-withholding attack:
 *
 *   1. 4 validators, all in the committee. slashSelfAllowed, quorum 3.
 *   2. Pick one validator to be the malicious proposer (A). Its outbound tx gossip is
 *      stubbed so the tx never leaves A's mempool. The tx is sent directly to A.
 *   3. Two other committee members (B, C) are configured to "attest blindly" — their
 *      block- and checkpoint-proposal handlers are stubbed to return isValid:true without
 *      re-executing. They sign whatever A broadcasts.
 *   4. The fourth committee member (D) is honest: it tries to fetch the missing tx, can't,
 *      and refuses to attest.
 *   5. Tx-collection is also stubbed on every node so no path can pull the tx from A —
 *      not at proposal time, not via post-mining backfill. This simulates the data being
 *      genuinely unavailable to anyone except A.
 *   6. A self-attests + collects B's and C's attestations → quorum 3 → publishes.
 *   7. After `slashDataWithholdingToleranceSlots` full slots, the watchers on B, C, and D
 *      probe `getAvailableTxs` against their own mempools, find the tx missing, and emit
 *      a slot-keyed DATA_WITHHOLDING for the three attesters (A, B, C).
 *   8. With slashSelfAllowed the offense reaches quorum; A, B, C are slashed on L1. D is
 *      not slashed because it never attested.
 */
describe('e2e_p2p_data_withholding_slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[] = [];

  const slashingUnit = BigInt(1e18);
  const slashingQuorum = 3;
  // L1 enforces `QUORUM > ROUND_SIZE / 2`, so with quorum=3 we cap round size at 5.
  // With committee 4 and only B/C/D voting (A has the tx and never detects the offense),
  // a single 4-slot round only meets quorum when all three of B/C/D happen to propose
  // (~23% probability). Extending slashOffenseExpirationRounds gives us several rounds to
  // hit quorum before the offense expires.
  const slashingRoundSize = 4;
  const aztecEpochDuration = 2;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_data_withholding_slash',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        anvilSlotsInAnEpoch: 4,
        listenAddress: '127.0.0.1',
        aztecEpochDuration,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        aztecTargetCommitteeSize: COMMITTEE_SIZE,
        // Long proof submission window so the legacy L1-prune path is irrelevant.
        aztecProofSubmissionEpochs: 1024,
        slashInactivityConsecutiveEpochThreshold: 32,
        slashingQuorum,
        slashingRoundSizeInEpochs: slashingRoundSize / aztecEpochDuration,
        slashAmountSmall: slashingUnit,
        slashAmountMedium: slashingUnit * 2n,
        slashAmountLarge: slashingUnit * 3n,
        slashSelfAllowed: true,
        slashDataWithholdingToleranceSlots: TOLERANCE_SLOTS,
        minTxsPerBlock: 1,
        inboxLag: 2,
      },
    });

    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    if (nodes.length > 0) {
      await t.stopNodes(nodes);
    }
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('slashes attesters that attest to proposals containing withheld transactions', async () => {
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    const { rollup } = await t.getContracts();

    // Jump to an epoch where the validator set is non-empty. The validator set rotates per
    // epoch and sometimes lands empty for early epochs, so advance epoch-by-epoch until we
    // find one with a full committee.
    let epoch = EpochNumber(4);
    await retryUntil(
      async () => {
        await t.ctx.cheatCodes.rollup.advanceToEpoch(epoch);
        const committee = await rollup.getCurrentEpochCommittee();
        if (committee?.length === NUM_VALIDATORS) {
          t.logger.warn(`Found valid committee of ${committee.length} at epoch ${epoch}`);
          return true;
        }
        t.logger.warn(`Epoch ${epoch} has ${committee?.length ?? 0} committee members, advancing`);
        epoch = EpochNumber(epoch + 1);
        return false;
      },
      'epoch with full committee',
      120,
      0,
    );

    const [activationThreshold, ejectionThreshold, localEjectionThreshold] = await Promise.all([
      rollup.getActivationThreshold(),
      rollup.getEjectionThreshold(),
      rollup.getLocalEjectionThreshold(),
    ]);
    const slashingAmount = slashingUnit * 3n;
    const biggestEjection = ejectionThreshold > localEjectionThreshold ? ejectionThreshold : localEjectionThreshold;
    expect(activationThreshold - slashingAmount).toBeLessThan(biggestEjection);

    t.ctx.aztecNodeConfig.slashDataWithholdingPenalty = slashingAmount;
    t.ctx.aztecNodeConfig.minTxsPerBlock = 1;

    t.logger.warn('Creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      shouldCollectMetrics(),
    );

    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS);

    await awaitCommitteeExists({ rollup, logger: t.logger });

    // The validator watchers floor processing at their boot slot. Advance past it so the tx
    // checkpoint lands in a slot the watcher will actually process.
    await t.ctx.cheatCodes.rollup.advanceToEpoch(EpochNumber(8));

    // Assign roles. With minTxsPerBlock=1 and tx gossip suppressed on the proposer, only the
    // proposer can ever build a block, so we just wait for it to be designated proposer.
    const [proposerNode, blindAttester1, blindAttester2, honestNode] = nodes;
    const proposerAddress = proposerNode.getSequencer()!.validatorAddresses![0];
    const blindAttester1Address = blindAttester1.getSequencer()!.validatorAddresses![0];
    const blindAttester2Address = blindAttester2.getSequencer()!.validatorAddresses![0];
    const honestAddress = honestNode.getSequencer()!.validatorAddresses![0];
    t.logger.warn(
      `Proposer ${proposerAddress}, blind attesters ${blindAttester1Address}/${blindAttester2Address}, honest ${honestAddress}`,
    );

    // 1. Stub outbound tx gossip on the proposer. Tx messages going out are dropped silently;
    //    other gossip topics (proposals, attestations) pass through.
    const proposerP2pService: any = (proposerNode as any).p2pClient.p2pService;
    const originalPropagate = proposerP2pService.propagate.bind(proposerP2pService);
    jest.spyOn(proposerP2pService, 'propagate').mockImplementation(((msg: any) => {
      if (msg instanceof Tx) {
        t.logger.info(`Suppressing outbound tx gossip from proposer ${proposerAddress}`);
        return Promise.resolve();
      }
      return originalPropagate(msg);
    }) as any);

    // 2. Stub tx-collection on EVERY node so nothing can pull the tx back from the proposer
    //    over reqresp (neither at proposal time nor via post-mining backfill).
    for (const node of nodes) {
      const txCollection: any = (node as any).p2pClient.txCollection;
      jest.spyOn(txCollection, 'collectFastFor').mockResolvedValue([]);
      jest.spyOn(txCollection, 'collectFastForBlock').mockResolvedValue(undefined);
    }

    // 3. Stub block- and checkpoint-proposal handling on the blind attesters so they attest
    //    without re-executing or fetching txs.
    for (const node of [blindAttester1, blindAttester2]) {
      const proposalHandler: any = (node as any).validatorClient.getProposalHandler();
      jest.spyOn(proposalHandler, 'handleBlockProposal').mockImplementation((async () => {
        const blockNumber = await node.getBlockNumber();
        return { isValid: true, blockNumber: BlockNumber(blockNumber + 1) };
      }) as any);
      jest.spyOn(proposalHandler, 'handleCheckpointProposal').mockResolvedValue({
        isValid: true,
        checkpointNumber: CheckpointNumber(1),
      } as any);
    }

    // 4. Send the tx directly to the proposer; it propagates into the local mempool and stays
    //    there (gossip suppressed). Combined with `minTxsPerBlock: 1`, only the proposer can
    //    build a block, so the tx sits in the mempool until the proposer is next selected.
    t.logger.warn(`Submitting tx through proposer ${proposerAddress}`);
    const [txHash] = await submitTransactions(t.logger, proposerNode, 1, t.fundedAccount);
    await waitForTx(proposerNode, txHash, { timeout: AZTEC_SLOT_DURATION * 6 * 1000 });
    const checkpointSlot = await getMinedSlot(proposerNode, txHash);
    t.logger.warn(`Tx ${txHash} mined at checkpoint slot ${checkpointSlot}`);

    // 5. After the tolerance window, every non-proposer's watcher should fire for the 3
    //    attesters (proposer A self-signs, plus blind attesters B and C).
    const expectedOffendedAddresses = [proposerAddress, blindAttester1Address, blindAttester2Address]
      .map(a => a.toString())
      .sort();

    const offenses = await awaitOffenseDetected({
      epochDuration: t.ctx.aztecNodeConfig.aztecEpochDuration,
      logger: t.logger,
      nodeAdmin: honestNode,
      slashingRoundSize,
      waitUntilOffenseCount: 3,
      timeoutSeconds: AZTEC_SLOT_DURATION * (TOLERANCE_SLOTS + 8),
    });

    expect(offenses).toHaveLength(3);
    expect(offenses.map(o => o.offenseType)).toEqual(offenses.map(() => OffenseType.DATA_WITHHOLDING));
    for (const offense of offenses) {
      expect(offense.epochOrSlot).toEqual(BigInt(checkpointSlot));
    }
    expect(offenses.map(o => o.validator.toString()).sort()).toEqual(expectedOffendedAddresses);
    // The honest non-attester must NOT be slashed.
    expect(offenses.map(o => o.validator.toString())).not.toContain(honestAddress.toString());
  });
});

/** Returns the slot at which a tx was included, by querying the node's tx receipt. */
async function getMinedSlot(node: AztecNodeService, txHash: TxHash): Promise<number> {
  const receipt = await node.getTxReceipt(txHash);
  if (!receipt.blockNumber) {
    throw new Error(`Tx ${txHash} has no block number on receipt`);
  }
  const block = await node.getBlock(receipt.blockNumber);
  if (!block) {
    throw new Error(`Block ${receipt.blockNumber} not found`);
  }
  return Number(block.header.getSlot());
}
