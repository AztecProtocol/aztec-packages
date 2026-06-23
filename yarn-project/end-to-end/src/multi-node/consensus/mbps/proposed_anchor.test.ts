import { Fr } from '@aztec/aztec.js/fields';
import { TxStatus } from '@aztec/stdlib/tx';

import { proveInteraction } from '../../../test-wallet/utils.js';
import {
  type MbpsFixture,
  TX_COUNT,
  assertMultipleBlocksPerSlot,
  jest,
  setupMbps,
  waitForProvenCheckpoint,
} from './setup.js';

describe('multi-node/consensus/mbps/proposed_anchor', () => {
  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Starts sequencers then sends txs one at a time, anchoring each to the proposed block containing
  // the previous tx (PXE in 'proposed' mode). Verifies tx anchor block numbers are monotonically
  // non-decreasing. Asserts ≥2 blocks per checkpoint and waits for the MBPS checkpoint to be proven.
  it('builds multiple blocks per slot with transactions anchored to proposed blocks', async () => {
    fixture = await setupMbps({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 1 });
    const { context, logger, rollup, nodes, contract, wallet, from } = fixture;

    // Record the current checkpoint number before starting sequencers
    const initialCheckpointNumber = await rollup.getCheckpointNumber();
    logger.warn(`Initial checkpoint number: ${initialCheckpointNumber}`);

    // Start the sequencers
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    // Now send the txs and wait for them to be mined one at a time
    // If the pxe syncs correctly, every tx should be anchored to the block in which the previous one was mined
    const txReceipts = [];
    let expectedAnchorBlockNumber = undefined;

    while (txReceipts.length < TX_COUNT / 2) {
      logger.warn(`Sending transaction ${txReceipts.length}`);
      const nullifier = new Fr(txReceipts.length + 1);
      const tx = await proveInteraction(context.wallet, contract.methods.emit_nullifier(nullifier), { from });
      const txAnchorBlockNumber = tx.data.constants.anchorBlockHeader.globalVariables.blockNumber;
      expect(txAnchorBlockNumber).toBeGreaterThanOrEqual(expectedAnchorBlockNumber ?? txAnchorBlockNumber);

      const txReceipt = await tx.send({ wait: { waitForStatus: TxStatus.PROPOSED } });
      txReceipts.push(txReceipt);
      expectedAnchorBlockNumber = txReceipt.blockNumber;
      logger.warn(`Transaction ${txReceipts.length} mined on block ${txReceipt.blockNumber}`, { txReceipt });

      await wallet.sync();
      expect((await wallet.getSyncedBlockHeader()).getBlockNumber()).toBeGreaterThanOrEqual(txReceipt.blockNumber!);
    }
    logger.warn(`All txs have been mined`);

    // We are fine with at least 2 blocks per checkpoint, since we may lose one sub-slot if assembling a tx is slow
    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(fixture, 2);
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});
