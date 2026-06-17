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
import type { BlockData } from '@aztec/stdlib/block';
import type { CheckpointData, ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
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
 * The finder scans for two consecutive proposal slots S1 and S2=S1+1 both owned by the SAME HA pair
 * (either pair). It nominates one node of that pair as the builder (proposes S1) and the other as the
 * peer (proposes S2) — the choice is arbitrary since they share keys. The test then routes S1 to the
 * builder and S2 to the peer via the test-only `pauseProposingForSlots` hook. The precise failure it
 * asserts (PRIMARY discriminator) is timing independent: after the builder broadcasts S1's checkpoint
 * proposal and the peer reexecutes the S1 block, the peer never records S1's proposed-checkpoint
 * metadata. This does not depend on whether or when S1 lands on L1.
 *
 * The downstream consequence (SECONDARY confirmation, the real-world symptom) is that without that
 * metadata the peer cannot build S2 on top of the proposed S1: when its block fails to match a proposed
 * checkpoint it prunes the S1 block as an orphan, rebuilds checkpoint 1 itself, and never produces S2's
 * checkpoint. With the fix, checkpoint 1 (covering S1, built by the builder) and checkpoint 2 (covering
 * S2, built by the peer) both land on L1, and S2's covered block carries the peer's distinct coinbase.
 */
describe('e2e_epochs/epochs_ha_checkpoint_handoff', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let rollup: RollupContract;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];

  /**
   * Describes one HA pair: its two member nodes, their two attester addresses (lowercased, for
   * proposer-membership testing) and their two distinct coinbases. The finder matches a pair, then
   * nominates one member as the builder and the other as the peer.
   */
  type HaPair = {
    nodes: [AztecNodeService, AztecNodeService];
    addresses: string[];
    coinbases: [EthAddress, EthAddress];
  };

  // The two HA pairs, populated by setupTest.
  let haPairs: HaPair[];

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
      startProverNode: false,
      skipInitialSequencer: true,
      aztecEpochDuration: 8,
      aztecProofSubmissionEpochs: 1024,
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

    const addressesA = [pk1, pk2].map(pk => privateKeyToAccount(pk).address.toLowerCase());
    const addressesB = [pk3, pk4].map(pk => privateKeyToAccount(pk).address.toLowerCase());

    // Use different coinbase addresses per node so HA peers build distinguishable blocks (the secondary
    // assertion relies on this to prove which node produced S2's checkpoint). Each HA pair shares a
    // slashing protection DB so only one peer signs per duty. buildCheckpointIfEmpty + minTxsPerBlock: 0
    // lets proposers build empty checkpoints without txs.
    const baseOpts = { dontStartSequencer: true, buildCheckpointIfEmpty: true, minTxsPerBlock: 0 } as const;
    const sharedDb1 = await createSharedSlashingProtectionDb(context.dateProvider);
    const sharedDb2 = await createSharedSlashingProtectionDb(context.dateProvider);

    const coinbaseA1 = EthAddress.fromNumber(1);
    const coinbaseA2 = EthAddress.fromNumber(2);
    const coinbaseB1 = EthAddress.fromNumber(3);
    const coinbaseB2 = EthAddress.fromNumber(4);

    logger.warn(`Creating 4 validator nodes in 2 HA pairs.`);
    nodes = [
      // Pair A: {nodes[0], nodes[1]} share {pk1, pk2}
      await test.createValidatorNode([pk1, pk2], {
        ...baseOpts,
        coinbase: coinbaseA1,
        slashingProtectionDb: sharedDb1,
      }),
      await test.createValidatorNode([pk1, pk2], {
        ...baseOpts,
        coinbase: coinbaseA2,
        slashingProtectionDb: sharedDb1,
      }),
      // Pair B: {nodes[2], nodes[3]} share {pk3, pk4}
      await test.createValidatorNode([pk3, pk4], {
        ...baseOpts,
        coinbase: coinbaseB1,
        slashingProtectionDb: sharedDb2,
      }),
      await test.createValidatorNode([pk3, pk4], {
        ...baseOpts,
        coinbase: coinbaseB2,
        slashingProtectionDb: sharedDb2,
      }),
    ];

    haPairs = [
      { nodes: [nodes[0], nodes[1]], addresses: addressesA, coinbases: [coinbaseA1, coinbaseA2] },
      { nodes: [nodes[2], nodes[3]], addresses: addressesB, coinbases: [coinbaseB1, coinbaseB2] },
    ];

    logger.warn(`Created 4 validator nodes.`);
    logger.warn(`Test setup completed.`);
  }

  /**
   * Result of {@link findConsecutiveSamePairSlots}: the matched slots plus the builder/peer nodes (and
   * the peer's coinbase) for the pair that owns both slots. The builder proposes S1 and the peer
   * proposes S2; which member of the pair plays which role is arbitrary since they share keys.
   */
  type MatchedPairSlots = {
    slotS1: SlotNumber;
    slotS2: SlotNumber;
    builder: AztecNodeService;
    peer: AztecNodeService;
    peerCoinbase: EthAddress;
    builderArchiver: Archiver;
    peerArchiver: Archiver;
  };

  /**
   * Scans forward from the current slot for two consecutive proposal slots S1 and S2=S1+1 that are both
   * proposed by the SAME HA pair (either pair). Returns which pair owns the slots, nominating its first
   * member as the builder (proposes S1) and its second as the peer (proposes S2). The L1 rollup only
   * exposes proposers for epochs whose randao seed is stable; looking too far ahead reverts with
   * `ValidatorSelection__EpochNotStable`, which we recover from by warping L1 forward one epoch and
   * retrying.
   */
  async function findConsecutiveSamePairSlots(): Promise<MatchedPairSlots> {
    const matchingPair = (proposer: EthAddress | undefined): HaPair | undefined =>
      proposer === undefined
        ? undefined
        : haPairs.find(pair => pair.addresses.includes(proposer.toString().toLowerCase()));

    let candidate = Number(test.epochCache.getEpochAndSlotNow().slot) + 4;
    const maxAttempts = 200;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const [p1, p2] = await Promise.all([
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate)),
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate + 1)),
        ]);
        const pairS1 = matchingPair(p1);
        const pairS2 = matchingPair(p2);
        if (pairS1 !== undefined && pairS1 === pairS2) {
          const [builder, peer] = pairS1.nodes;
          logger.warn(`Found consecutive same-pair proposal slots ${candidate} and ${candidate + 1}.`, {
            slotS1: candidate,
            slotS2: candidate + 1,
            proposerS1: p1?.toString(),
            proposerS2: p2?.toString(),
            pairAddresses: pairS1.addresses,
          });
          return {
            slotS1: SlotNumber(candidate),
            slotS2: SlotNumber(candidate + 1),
            builder,
            peer,
            peerCoinbase: pairS1.coinbases[1],
            builderArchiver: builder.getBlockSource() as Archiver,
            peerArchiver: peer.getBlockSource() as Archiver,
          };
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
    throw new Error(`Could not find two consecutive slots both proposed by the same HA pair`);
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  it('HA peer records and takes over the pipelined checkpoint when its builder peer proposes the previous slot', async () => {
    await setupTest();

    // Find two consecutive proposal slots both owned by the same HA pair, and the builder/peer roles.
    const { slotS1, slotS2, builder, peer, peerCoinbase, builderArchiver, peerArchiver } =
      await findConsecutiveSamePairSlots();

    // Route S1 to the builder and S2 to its HA peer:
    //  - pause the peer for S1, so only the builder builds and broadcasts S1's checkpoint proposal.
    //  - pause the builder for S2, so the peer must take over S2 — building on top of the proposed S1.
    builder.getSequencer()!.updateConfig({ pauseProposingForSlots: [slotS2] });
    peer.getSequencer()!.updateConfig({ pauseProposingForSlots: [slotS1] });
    logger.warn(`Paused builder for slot ${slotS2}; paused peer for slot ${slotS1}.`);

    // Under proposer pipelining the proposer for proposal slot S1 builds during wall-clock slot S1-1.
    // Warp to 1 L1 slot before the build slot (S1-1) so the builder starts cleanly.
    const buildSlotForS1 = SlotNumber(slotS1 - 1);
    const buildSlotTimestamp = getTimestampForSlot(buildSlotForS1, test.constants);
    await context.cheatCodes.eth.warp(Number(buildSlotTimestamp) - test.L1_BLOCK_TIME_IN_S, {
      resetBlockInterval: true,
    });
    logger.warn(`Warped to 1 L1 slot before L2 build slot ${buildSlotForS1} (proposal slot ${slotS1}).`);

    expect(await builder.getBlockNumber()).toEqual(0);

    // Start the sequencers on all nodes.
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers.`);

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
    logger.warn(`Waiting for HA peer to record proposed checkpoint for S1 (slot ${slotS1}).`);
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
    // it. Checkpoint 1 covers S1 (built by the builder) and checkpoint 2 covers S2 (built by the peer).
    // Assert the peer's archiver holds L2 block 2 at slot S2. (With the bug this never happens because the
    // peer prunes S1 and rebuilds checkpoint 1 itself, skipping S2's slot.)
    logger.warn(`Waiting for HA peer to produce S2 (slot ${slotS2}) as L2 block 2.`);
    await retryUntil(
      async () => {
        const block = await peerArchiver.getBlockData({ number: BlockNumber(2) });
        return !!block && Number(block.header.getSlot()) === Number(slotS2);
      },
      `HA peer builds S2 (slot ${slotS2}) as L2 block 2`,
      test.L2_SLOT_DURATION_IN_S * 6,
      0.5,
    );

    // Confirm the on-chain checkpoint chain advances to 2. Checkpoints publish in order, so checkpoint 2
    // cannot land before checkpoint 1; budget generously for ordered publication.
    await test.waitUntilCheckpointNumber(CheckpointNumber(2), test.L2_SLOT_DURATION_IN_S * 4);
    const finalCheckpointNumber = await rollup.getCheckpointNumber();
    logger.warn(`Final on-chain checkpoint number: ${finalCheckpointNumber}.`);
    expect(finalCheckpointNumber).toBeGreaterThanOrEqual(2);

    // Assert BOTH per-slot checkpoints landed on L1, mapping each to its covered slot via startBlock.
    // getCheckpointData returns L1-confirmed checkpoints only; a defined result with its `l1` field set
    // means the checkpoint was posted to L1. The on-chain checkpoint number above advances as soon as the
    // tx mines, but the peer's archiver indexes the L1-confirmed checkpoint a poll later, so retry until
    // it has the data before asserting.
    const waitForPostedCheckpointForSlot = async (checkpointNumber: number, expectedSlot: SlotNumber) => {
      let result: { checkpoint: CheckpointData; coveredBlock: BlockData } | undefined;
      await retryUntil(
        async () => {
          const checkpoint = await peerArchiver.getCheckpointData({ number: CheckpointNumber(checkpointNumber) });
          if (!checkpoint?.l1) {
            return false;
          }
          const coveredBlock = await peerArchiver.getBlockData({ number: checkpoint.startBlock });
          if (!coveredBlock) {
            return false;
          }
          result = { checkpoint, coveredBlock };
          return true;
        },
        `HA peer indexes L1-posted checkpoint ${checkpointNumber} covering slot ${expectedSlot}`,
        test.L2_SLOT_DURATION_IN_S * 4,
        0.5,
      );
      expect(Number(result!.coveredBlock.header.getSlot())).toEqual(Number(expectedSlot));
      return result!;
    };

    // Checkpoint 1 covers S1 (built and posted by the builder).
    await waitForPostedCheckpointForSlot(1, slotS1);
    logger.warn(`Checkpoint 1 posted to L1 covering S1 (slot ${slotS1}).`);

    // Checkpoint 2 covers S2 (the HA peer took over). Beyond confirming it was posted, prove the PEER
    // produced it: its covered block must carry the peer's distinct coinbase (each node uses its own).
    const { coveredBlock: s2Block } = await waitForPostedCheckpointForSlot(2, slotS2);
    const s2Coinbase = s2Block.header.globalVariables.coinbase;
    expect(s2Coinbase.equals(peerCoinbase)).toBe(true);
    logger.warn(`Checkpoint 2 posted to L1 covering S2 (slot ${slotS2}) with the peer's coinbase.`, {
      coinbase: s2Coinbase.toString(),
      expectedPeerCoinbase: peerCoinbase.toString(),
    });
  });
});
