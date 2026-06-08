import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import type { ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { createSharedSlashingProtectionDb } from '@aztec/validator-ha-signer/factory';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 20);

const VALIDATOR_COUNT = 4;

/**
 * E2E test reproducing a checkpoint-proposal handoff bug in HA (High Availability) setups.
 *
 * Two nodes (an HA pair) share the same validator keys. Under proposer pipelining, the proposer for
 * proposal slot S1 builds and broadcasts its checkpoint during wall-clock slot S1-1, then the
 * proposer for slot S2=S1+1 builds during wall-clock slot S1 on top of S1's still-PROPOSED checkpoint.
 * To build on top of the proposed S1, the S2 proposer needs S1's proposed-checkpoint metadata in its
 * archiver.
 *
 * When the S1 checkpoint proposal is broadcast, its HA peer receives it (gossipsub delivers it because
 * it is not the peer's own gossip message). But the all-nodes checkpoint handler in
 * `validator-client/src/proposal_handler.ts` treats the proposal as "own" — it is signed by a key the
 * peer also owns — and returns early without calling `setProposedCheckpointFromValidation`. The peer's
 * archiver therefore never records the proposed-checkpoint metadata for S1, even though the peer does
 * receive and reexecute the S1 block proposal (block-proposal handling works for HA).
 *
 * This test routes S1 to the builder (nodes[0]) and S2 to its HA peer (nodes[1]) via the test-only
 * `pauseProposingForSlots` hook. The precise failure it asserts (PRIMARY discriminator) is timing
 * independent: after the builder broadcasts S1's checkpoint proposal and the peer reexecutes the S1
 * block, the peer never records S1's proposed-checkpoint metadata. This does not depend on whether or
 * when S1 lands on L1.
 *
 * The downstream consequence (SECONDARY confirmation, the real-world symptom) is that without that
 * metadata the peer cannot build S2 on top of the proposed S1: when its block fails to match a proposed
 * checkpoint it prunes the S1 block as an orphan, rebuilds checkpoint 1 itself, and never produces S2's
 * checkpoint. The on-chain checkpoint chain still advances past 1 (later proposers keep building), but
 * S2's slot is skipped — block 2 with slot S2 never appears on the peer.
 *
 * We deliberately do NOT delay the builder's S1 L1 submission. The publisher speeds up a stuck tx by
 * sending a replacement (same nonce, higher gas) via a fresh `sendRawTransaction`, which the single-shot
 * tx delayer does not intercept, so a delay would not reliably hold S1 off L1 anyway (see
 * `l1_tx_utils.ts` `monitorTransaction` speed-up path). The bug does not require the delay: the peer
 * fails to record the proposed checkpoint regardless of when S1 is checkpointed on L1.
 */
describe('e2e_epochs/epochs_ha_checkpoint_handoff', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let rollup: RollupContract;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];

  // The attester addresses owned by the HA pair {nodes[0], nodes[1]} (keys pk1, pk2).
  let pairAddresses: string[];

  async function setupTest() {
    validators = times(VALIDATOR_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    // No initial sequencer: the validator nodes do all the building, and they build empty checkpoints
    // (buildCheckpointIfEmpty + minTxsPerBlock: 0) so no transactions are needed. We keep checkpoint
    // publishing ENABLED (unlike epochs_ha_sync.test.ts): the handoff must produce a real on-chain
    // checkpoint.
    test = await EpochsTestContext.setup({
      initialValidators: validators,
      mockGossipSubNetwork: true,
      disableAnvilTestWatcher: true,
      startProverNode: false,
      skipInitialSequencer: true,
      aztecEpochDuration: 8,
      aztecProofSubmissionEpochs: 1024,
      enforceTimeTable: true,
      ethereumSlotDuration: 6,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      attestationPropagationTime: 0.5,
      aztecTargetCommitteeSize: VALIDATOR_COUNT,
      inboxLag: 2,
    });

    ({ context, logger, rollup } = test);

    // Create 4 nodes in 2 HA pairs: each pair shares the same two validator keys.
    const pk1 = validators[0].privateKey;
    const pk2 = validators[1].privateKey;
    const pk3 = validators[2].privateKey;
    const pk4 = validators[3].privateKey;

    pairAddresses = [pk1, pk2].map(pk => privateKeyToAccount(pk).address.toLowerCase());

    // Use different coinbase addresses per node so HA peers would build different blocks if propagation
    // were broken. Each HA pair shares a slashing protection DB so only one peer signs per duty.
    // buildCheckpointIfEmpty + minTxsPerBlock: 0 lets proposers build empty checkpoints without txs.
    const baseOpts = { dontStartSequencer: true, buildCheckpointIfEmpty: true, minTxsPerBlock: 0 } as const;
    const sharedDb1 = await createSharedSlashingProtectionDb(context.dateProvider);
    const sharedDb2 = await createSharedSlashingProtectionDb(context.dateProvider);

    logger.warn(`Creating 4 validator nodes in 2 HA pairs.`);
    nodes = [
      // Pair A: {nodes[0]=builder, nodes[1]=peer} share {pk1, pk2}
      await test.createValidatorNode([pk1, pk2], {
        ...baseOpts,
        coinbase: EthAddress.fromNumber(1),
        slashingProtectionDb: sharedDb1,
      }),
      await test.createValidatorNode([pk1, pk2], {
        ...baseOpts,
        coinbase: EthAddress.fromNumber(2),
        slashingProtectionDb: sharedDb1,
      }),
      // Pair B: {nodes[2], nodes[3]} share {pk3, pk4}
      await test.createValidatorNode([pk3, pk4], {
        ...baseOpts,
        coinbase: EthAddress.fromNumber(3),
        slashingProtectionDb: sharedDb2,
      }),
      await test.createValidatorNode([pk3, pk4], {
        ...baseOpts,
        coinbase: EthAddress.fromNumber(4),
        slashingProtectionDb: sharedDb2,
      }),
    ];
    logger.warn(`Created 4 validator nodes.`);
    logger.warn(`Test setup completed.`);
  }

  /**
   * Scans forward from the current slot for two consecutive proposal slots S1 and S2=S1+1 that are
   * both proposed by the HA pair {nodes[0], nodes[1]}. The L1 rollup only exposes proposers for epochs
   * whose randao seed is stable; looking too far ahead reverts with `ValidatorSelection__EpochNotStable`,
   * which we recover from by warping L1 forward one epoch and retrying.
   */
  async function findConsecutiveSamePairSlots(): Promise<SlotNumber> {
    const ownedByPair = (proposer: EthAddress | undefined) =>
      proposer !== undefined && pairAddresses.includes(proposer.toString().toLowerCase());

    let candidate = Number(test.epochCache.getEpochAndSlotNow().slot) + 4;
    const maxAttempts = 200;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const [p1, p2] = await Promise.all([
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate)),
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate + 1)),
        ]);
        if (ownedByPair(p1) && ownedByPair(p2)) {
          logger.warn(`Found consecutive same-pair proposal slots ${candidate} and ${candidate + 1}.`, {
            slotS1: candidate,
            slotS2: candidate + 1,
            proposerS1: p1?.toString(),
            proposerS2: p2?.toString(),
            pairAddresses,
          });
          return SlotNumber(candidate);
        }
        candidate++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('EpochNotStable')) {
          throw err;
        }
        const block = await test.l1Client.getBlock({ includeTransactions: false });
        const warpBy = test.epochDuration * test.L2_SLOT_DURATION_IN_S;
        const newTs = Number(block.timestamp) + warpBy;
        logger.warn(`Hit EpochNotStable at candidate ${candidate}, warping L1 forward by ${warpBy}s to ${newTs}`);
        await context.cheatCodes.eth.warp(newTs, { resetBlockInterval: true });
        const newCurrentSlot = Number(test.epochCache.getEpochAndSlotNow().slot);
        if (candidate < newCurrentSlot + 4) {
          candidate = newCurrentSlot + 4;
        }
      }
    }
    throw new Error(`Could not find two consecutive slots both proposed by the HA pair`);
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  it('HA peer records and takes over the pipelined checkpoint when its builder peer proposes the previous slot', async () => {
    await setupTest();

    // Find two consecutive proposal slots both owned by the HA pair {nodes[0], nodes[1]}.
    const slotS1 = await findConsecutiveSamePairSlots();
    const slotS2 = SlotNumber(slotS1 + 1);

    // Route S1 to the builder (nodes[0]) and S2 to its HA peer (nodes[1]):
    //  - pause nodes[1] for S1, so only nodes[0] builds and broadcasts S1's checkpoint proposal.
    //  - pause nodes[0] for S2, so nodes[1] must take over S2 — building on top of the proposed S1.
    nodes[0].getSequencer()!.updateConfig({ pauseProposingForSlots: [slotS2] });
    nodes[1].getSequencer()!.updateConfig({ pauseProposingForSlots: [slotS1] });
    logger.warn(`Paused builder (node 0) for slot ${slotS2}; paused peer (node 1) for slot ${slotS1}.`);

    // Under proposer pipelining the proposer for proposal slot S1 builds during wall-clock slot S1-1.
    // Warp to 1 L1 slot before the build slot (S1-1) so the builder starts cleanly.
    const buildSlotForS1 = SlotNumber(slotS1 - 1);
    const buildSlotTimestamp = getTimestampForSlot(buildSlotForS1, test.constants);
    await context.cheatCodes.eth.warp(Number(buildSlotTimestamp) - test.L1_BLOCK_TIME_IN_S, {
      resetBlockInterval: true,
    });
    logger.warn(`Warped to 1 L1 slot before L2 build slot ${buildSlotForS1} (proposal slot ${slotS1}).`);

    expect(await nodes[0].getBlockNumber()).toEqual(0);

    // Start the sequencers on all nodes.
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers.`);

    const builderArchiver = nodes[0].getBlockSource() as Archiver;
    const peerArchiver = nodes[1].getBlockSource() as Archiver;

    // The builder always records its own proposed S1 checkpoint locally (its sequencer pushes it to the
    // archiver before broadcasting), independent of the handoff bug. Use it as the source of truth for
    // S1's expected proposed-checkpoint metadata.
    let builderProposedS1: ProposedCheckpointData | undefined;
    await retryUntil(
      async () => {
        builderProposedS1 = await builderArchiver.getProposedCheckpointData({ slot: slotS1 });
        return !!builderProposedS1;
      },
      `builder records its own proposed checkpoint for S1 (slot ${slotS1})`,
      test.L2_SLOT_DURATION_IN_S * 3,
      0.5,
    );
    logger.warn(`Builder recorded proposed checkpoint for S1 (slot ${slotS1}).`, {
      checkpointNumber: builderProposedS1!.checkpointNumber,
      archive: builderProposedS1!.archive.root.toString(),
    });

    // PRIMARY, timing-independent discriminator for the bug. Once the builder has broadcast S1's
    // checkpoint proposal and the peer has reexecuted the S1 block, the peer MUST record S1's
    // proposed-checkpoint metadata in its own archiver. With the handoff bug present the peer's all-nodes
    // checkpoint handler treats the gossiped proposal as "own" and returns early, so it never records the
    // metadata — this retry then times out. The timeout is a few L2 slots: long enough to be reliable on
    // the fixed path (the peer must receive the proposal, reexecute the block, and record), short enough
    // not to waste minutes when the metadata is never recorded (bug path).
    logger.warn(`Waiting for HA peer (node 1) to record proposed checkpoint for S1 (slot ${slotS1}).`);
    await retryUntil(
      async () => {
        const peerProposedS1 = await peerArchiver.getProposedCheckpointData({ slot: slotS1 });
        return !!peerProposedS1 && peerProposedS1.archive.root.equals(builderProposedS1!.archive.root);
      },
      `HA peer records proposed checkpoint for S1 (slot ${slotS1}) matching the builder's archive`,
      test.L2_SLOT_DURATION_IN_S * 4,
      0.5,
    );
    logger.warn(`HA peer recorded proposed checkpoint for S1 (slot ${slotS1}).`);

    // SECONDARY confirmation of the real-world symptom the user reported ("the next node produces a
    // checkpoint successfully"): with S1's proposed checkpoint recorded, the peer can build S2 on top of
    // it. Checkpoint 1 covers S1 (built by node 0) and checkpoint 2 covers S2 (built by node 1). Assert
    // the peer's archiver holds L2 block 2 at slot S2. (With the bug this never happens because the peer
    // prunes S1 and rebuilds checkpoint 1 itself, skipping S2's slot.)
    logger.warn(`Waiting for HA peer (node 1) to produce S2 (slot ${slotS2}) as L2 block 2.`);
    await retryUntil(
      async () => {
        const block = await peerArchiver.getBlockData({ number: BlockNumber(2) });
        return !!block && Number(block.header.getSlot()) === Number(slotS2);
      },
      `HA peer builds S2 (slot ${slotS2}) as L2 block 2`,
      test.L2_SLOT_DURATION_IN_S * 6,
      0.5,
    );

    // Independently confirm S2's checkpoint actually lands on L1. Checkpoints publish in order, so
    // checkpoint 2 cannot land before checkpoint 1; budget generously for ordered publication.
    await test.waitUntilCheckpointNumber(CheckpointNumber(2), test.L2_SLOT_DURATION_IN_S * 4);
    const finalCheckpointNumber = await rollup.getCheckpointNumber();
    logger.warn(`Final on-chain checkpoint number: ${finalCheckpointNumber}.`);
    expect(finalCheckpointNumber).toBeGreaterThanOrEqual(2);
  });
});
