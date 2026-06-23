import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { createSharedSlashingProtectionDb } from '@aztec/validator-ha-signer/factory';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 20);

const VALIDATOR_COUNT = 4;
const TX_COUNT = 6;

/**
 * E2E test for HA (High Availability) proposed chain sync.
 * Verifies that nodes sharing validator keys with the proposer still process
 * block proposals and sync to the proposed chain, rather than ignoring them.
 */
describe('e2e_epochs/epochs_ha_sync', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let rollup: RollupContract;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let contract: TestContract;
  let wallet: TestWallet;
  let from: AztecAddress;

  async function setupTest() {
    validators = times(VALIDATOR_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    // Do NOT set skipPublishingCheckpointsPercent here: the initial sequencer needs to
    // publish checkpoints during setup (account deployment). We disable it per-validator-node below.
    test = await EpochsTestContext.setup({
      numberOfAccounts: 1,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      aztecEpochDuration: 4,
      ethereumSlotDuration: 4,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      attestationPropagationTime: 0.5,
      aztecTargetCommitteeSize: VALIDATOR_COUNT,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 2,
      pxeOpts: { syncChainTip: 'proposed' },
      inboxLag: 2,
    });

    ({ context, logger, rollup } = test);
    wallet = context.wallet;
    from = context.accounts[0];

    // Stop the initial non-validator sequencer.
    logger.warn(`Stopping sequencer in initial aztec node.`);
    await context.sequencer!.stop();

    // Create 4 nodes in 2 HA pairs: each pair shares the same two validator keys.
    const pk1 = validators[0].privateKey;
    const pk2 = validators[1].privateKey;
    const pk3 = validators[2].privateKey;
    const pk4 = validators[3].privateKey;

    // Disable checkpoint publishing on validator nodes so we can assert proposed chain sync
    // strictly before any checkpoint is published by the validators.
    // Use different coinbase addresses per node so HA peers would build different blocks
    // if the proposer's block isn't correctly propagated to its HA peer.
    // Each HA pair shares a slashing protection DB so only one peer can sign per duty.
    const baseOpts = { dontStartSequencer: true, skipPublishingCheckpointsPercent: 100 } as const;
    const sharedDb1 = await createSharedSlashingProtectionDb(context.dateProvider);
    const sharedDb2 = await createSharedSlashingProtectionDb(context.dateProvider);

    logger.warn(`Creating 4 validator nodes in 2 HA pairs.`);
    nodes = [
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

    // Point the wallet at a validator node so it tracks proposed blocks.
    wallet.updateNode(nodes[0]);

    // Register contract for sending txs.
    contract = await test.registerTestContract(wallet);
    logger.warn(`Test setup completed.`);
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  it('HA peers sync to proposed chain from proposals signed by their own validator keys', async () => {
    await setupTest();

    // Record the checkpoint state after setup. Validators must produce proposed blocks
    // beyond this point for the test to be meaningful.
    const allArchivers = nodes.map(n => n.getBlockSource() as Archiver);
    const initialCheckpointNumber = await rollup.getCheckpointNumber();
    const initialCheckpointedBlock = (await allArchivers[0].getL2Tips()).checkpointed.block.number;
    logger.warn(`Initial state: checkpoint ${initialCheckpointNumber}, checkpointed block ${initialCheckpointedBlock}`);

    // Pre-prove and send transactions.
    const txs = await timesAsync(TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(i + 1)), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions.`);

    // Warp to 1 L1 slot before the start of the following L2 slot, so sequencers start cleanly.
    // We don't warp to the next L2 slot because we may already be less than 1 L1 slot before it.
    const currentSlot = await rollup.getSlotNumber();
    const nextSlot = SlotNumber(currentSlot + 2);
    const nextSlotTimestamp = getTimestampForSlot(nextSlot, test.constants);
    await context.cheatCodes.eth.warp(Number(nextSlotTimestamp) - test.L1_BLOCK_TIME_IN_S, {
      resetBlockInterval: true,
    });
    logger.warn(`Warped to 1 L1 slot before L2 slot ${nextSlot}.`);

    // Start the sequencers on all nodes.
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers.`);

    // Wait until all nodes have proposed blocks strictly beyond the checkpointed tip.
    // This ensures we're checking blocks produced by validators via P2P proposals,
    // not blocks synced from L1 checkpoints during setup.
    await retryUntil(
      async () => {
        const tips = await Promise.all(allArchivers.map(a => a.getL2Tips()));
        return tips.every(
          t => t.proposed.number > initialCheckpointedBlock && t.proposed.number > t.checkpointed.block.number,
        );
      },
      'all nodes to sync proposed blocks beyond checkpointed tip',
      test.L2_SLOT_DURATION_IN_S * 5,
      0.5,
    );

    logger.warn(`All nodes synced proposed blocks beyond checkpointed tip`);

    // Take the smallest proposed tip across all nodes and verify the block hash matches on all of them.
    // This block is strictly proposed (not checkpointed), so it must have arrived via P2P.
    const tips = await Promise.all(allArchivers.map(a => a.getL2Tips()));
    const proposedNumbers = tips.map(t => t.proposed.number);
    const minProposed = BlockNumber(Math.min(...proposedNumbers));
    expect(minProposed).toBeGreaterThan(initialCheckpointedBlock);
    logger.warn(`Verifying block hashes at proposed block ${minProposed}.`, { proposedNumbers });

    const blockDatas = await Promise.all(allArchivers.map(a => a.getBlockData({ number: minProposed })));
    const hashes = await Promise.all(blockDatas.map(d => d!.header.hash()));
    for (let i = 1; i < hashes.length; i++) {
      expect(hashes[i].toString()).toBe(hashes[0].toString());
    }
    logger.warn(`All 4 nodes agree on block hash at proposed block ${minProposed}.`);

    // Verify that no new checkpoints have been published by validators (we disabled checkpoint publishing).
    const currentCheckpointNumber = await rollup.getCheckpointNumber();
    expect(currentCheckpointNumber).toBe(initialCheckpointNumber);
    logger.warn(`Verified no new checkpoints were published.`);
  });
});
