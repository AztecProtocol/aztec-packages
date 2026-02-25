import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { bufferToHex } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 20);

// palla: run this with more validators such that there are more nodes than committee size.
const NODE_COUNT = 4;
const EXPECTED_BLOCKS_PER_CHECKPOINT = 3;

// Send enough transactions to trigger multiple blocks within a checkpoint assuming 2 txs per block.
const TX_COUNT = 10;

/**
 * E2E tests for proposer pipelining with Multiple Blocks Per Slot (MBPS).
 * Verifies that with pipelining enabled, the block proposer in slot N is the validator
 * scheduled on L1 for slot N+1 (the proposer view uses a +1 slot offset).
 */
describe('e2e_epochs/epochs_mbps_pipeline', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let rollup: RollupContract;
  let archiver: Archiver;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let contract: TestContract;
  let wallet: TestWallet;
  let from: AztecAddress;

  /** Creates validators and sets up the test context with MBPS and proposer pipelining. */
  async function setupTest(opts: {
    syncChainTip: 'proposed' | 'checkpointed';
    minTxsPerBlock?: number;
    maxTxsPerBlock?: number;
  }) {
    const { syncChainTip = 'checkpointed', ...setupOpts } = opts;

    validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    test = await EpochsTestContext.setup({
      numberOfAccounts: 1,
      initialValidators: validators,
      enableProposerPipelining: true, // <- yehaw
      mockGossipSubNetwork: true,
      disableAnvilTestWatcher: true,
      startProverNode: true,
      aztecEpochDuration: 4,
      enforceTimeTable: true,
      ethereumSlotDuration: 4,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      l1PublishingTime: 2,
      attestationPropagationTime: 0.5,
      aztecTargetCommitteeSize: 3,
      ...setupOpts,
      pxeOpts: { syncChainTip },
    });

    ({ context, logger, rollup } = test);
    wallet = context.wallet;
    from = context.accounts[0];

    logger.warn(`Stopping sequencer in initial aztec node.`);
    await context.sequencer!.stop();

    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { dontStartSequencer: true }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    wallet.updateNode(nodes[0]);
    archiver = nodes[0].getBlockSource() as Archiver;

    contract = await test.registerTestContract(wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  }

  /** Retrieves all checkpoints from the archiver, checks that one has the target block count, and returns its number. */
  async function assertMultipleBlocksPerSlot(targetBlockCount: number, logger: Logger): Promise<CheckpointNumber> {
    const checkpoints = await archiver.getCheckpoints(CheckpointNumber(1), 50);
    logger.warn(`Retrieved ${checkpoints.length} checkpoints from archiver`, {
      checkpoints: checkpoints.map(pc => pc.checkpoint.getStats()),
    });

    let expectedBlockNumber = checkpoints[0].checkpoint.blocks[0].number;
    let multiBlockCheckpointNumber: CheckpointNumber | undefined;

    for (const checkpoint of checkpoints) {
      const blockCount = checkpoint.checkpoint.blocks.length;
      if (blockCount >= targetBlockCount && multiBlockCheckpointNumber === undefined) {
        multiBlockCheckpointNumber = checkpoint.checkpoint.number;
      }
      logger.warn(`Checkpoint ${checkpoint.checkpoint.number} has ${blockCount} blocks`, {
        checkpoint: checkpoint.checkpoint.getStats(),
      });

      for (let i = 0; i < blockCount; i++) {
        const block = checkpoint.checkpoint.blocks[i];
        expect(block.indexWithinCheckpoint).toBe(i);
        expect(block.checkpointNumber).toBe(checkpoint.checkpoint.number);
        expect(block.number).toBe(expectedBlockNumber);
        expectedBlockNumber++;
      }
    }

    expect(multiBlockCheckpointNumber).toBeDefined();
    return multiBlockCheckpointNumber!;
  }

  /** Waits until a specific multi-block checkpoint is proven. */
  async function waitForProvenCheckpoint(targetCheckpoint: CheckpointNumber) {
    const provenTimeout = test.L2_SLOT_DURATION_IN_S * test.epochDuration * 4;
    logger.warn(`Waiting for checkpoint ${targetCheckpoint} to be proven (timeout=${provenTimeout}s)`);
    await test.waitUntilProvenCheckpointNumber(targetCheckpoint, provenTimeout);
    logger.warn(`Proven checkpoint advanced to ${test.monitor.provenCheckpointNumber}`);
  }

  /**
   * Asserts that blocks were built by the pipelined proposer (slot+1 in L1 schedule).
   * For each block, queries L1 for the proposer at slot and slot+1, and verifies
   * the block's coinbase matches the slot+1 proposer. Requires at least one slot
   * where the two proposers differ (to prove the offset is real).
   */
  async function assertProposerPipelining(logger: Logger) {
    const checkpoints = await archiver.getCheckpoints(CheckpointNumber(1), 50);
    const allBlocks = checkpoints.flatMap(pc => pc.checkpoint.blocks);
    const constants = test.constants;

    let foundMismatch = false;
    const seenSlots = new Set<number>();

    for (const block of allBlocks) {
      const slot = block.header.globalVariables.slotNumber;
      // Only check the first block per slot (all blocks in same slot share the same proposer)
      if (seenSlots.has(Number(slot))) {
        continue;
      }
      seenSlots.add(Number(slot));

      const coinbase = block.header.globalVariables.coinbase;
      const slotTimestamp = getTimestampForSlot(slot, constants);
      const nextSlotTimestamp = getTimestampForSlot(SlotNumber(slot + 1), constants);

      const submissionProposer = await rollup.getProposerAt(slotTimestamp);
      const pipelinedProposer = await rollup.getProposerAt(nextSlotTimestamp);

      logger.warn(
        `Slot ${slot}: coinbase=${coinbase}, submissionProposer=${submissionProposer}, pipelinedProposer=${pipelinedProposer}`,
        {
          slot,
          coinbase: coinbase.toString(),
          submissionProposer: submissionProposer.toString(),
          pipelinedProposer: pipelinedProposer.toString(),
        },
      );

      // The block's coinbase must match the pipelined (slot+1) proposer
      expect(coinbase).toEqual(pipelinedProposer);

      if (!submissionProposer.equals(pipelinedProposer)) {
        // Strong assertion: proposer differs between slot and slot+1, proving the offset
        expect(coinbase).not.toEqual(submissionProposer);
        foundMismatch = true;
      }
    }

    // With 4 validators over multiple slots, we expect at least one slot where the
    // proposer for slot N differs from the proposer for slot N+1
    expect(foundMismatch).toBe(true);
    logger.warn(`Proposer pipelining assertion passed: found proposer mismatch across ${seenSlots.size} slots`);
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  it('pipelining builds blocks using slot+1 proposer and proves them', async () => {
    await setupTest({ syncChainTip: 'checkpointed', minTxsPerBlock: 1, maxTxsPerBlock: 2 });

    const initialCheckpointNumber = await rollup.getCheckpointNumber();
    logger.warn(`Initial checkpoint number: ${initialCheckpointNumber}`);

    // Pre-prove and send transactions
    const txs = await timesAsync(TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(i + 1)), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions`, { txs: txHashes });

    // Start the sequencers
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    await executeTimeout(
      () => Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All txs have been mined`);

    // Verify MBPS works with pipelining
    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(EXPECTED_BLOCKS_PER_CHECKPOINT, logger);

    // Verify the pipelining offset: each block's coinbase matches L1's slot+1 proposer
    await assertProposerPipelining(logger);

    // Verify proving still works end-to-end with pipelined proposers
    await waitForProvenCheckpoint(multiBlockCheckpoint);
  });
});
