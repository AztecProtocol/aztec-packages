import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import type { ChainMonitor } from '@aztec/ethereum/test';
import { timesAsync } from '@aztec/foundation/collection';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import { FAST_REORG_TIMING, SingleNodeTestContext } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 20);

/** Number of txs to send at the start of each reorg test to trigger multi-block checkpoints. */
export const TX_COUNT = 8;

/**
 * The single-node + prover-node fixture shared by the L1-reorg suites (`blocks`, `messages`). Stands
 * up a {@link SingleNodeTestContext} on the {@link FAST_REORG_TIMING} cadence (ethSlot=4s,
 * aztecSlot=36s, block=8s, epoch=4, 32 slots/epoch) with L1 speed-ups disabled so prover/sequencer txs
 * can be held back and reorged, registers a {@link TestContract}, and exposes the per-test handles plus
 * a `sendTransactions` helper that pre-proves and fires `count` lightweight txs to drive multi-block
 * checkpoints. Reorgs themselves are driven by `EthCheatCodes.reorg`/`reorgWithReplacement` at the call
 * site. The returned object's fields are populated when `setup()` resolves; create it in `beforeEach`.
 */
export class L1ReorgsTest {
  public test!: SingleNodeTestContext;
  public context!: EndToEndContext;
  public logger!: Logger;
  public node!: AztecNode;
  public archiver!: Archiver;
  public monitor!: ChainMonitor;
  public proverDelayer!: Delayer;
  public sequencerDelayer!: Delayer;
  public contract!: TestContract;
  public from!: AztecAddress;

  public L1_BLOCK_TIME_IN_S!: number;
  public L2_SLOT_DURATION_IN_S!: number;

  public async setup(): Promise<void> {
    this.test = await SingleNodeTestContext.setup({
      ...FAST_REORG_TIMING, // ethSlot=4s, aztecSlot=36s, block=8s, epoch=4, 32 slots/epoch (mainnet)
      numberOfAccounts: 1,
      maxSpeedUpAttempts: 0, // Do not speed up l1 txs, we dont want them to land
      cancelTxOnTimeout: false,
      minTxsPerBlock: 0,
      maxTxsPerBlock: 1,
      aztecProofSubmissionEpochs: 1,
      // Pipelining + multi-blocks-per-slot: 8s blocks fit ~4 blocks per 36s slot, and TX_COUNT=8
      // ensures multiple checkpoints have multiple blocks
    });
    ({
      proverDelayer: this.proverDelayer,
      sequencerDelayer: this.sequencerDelayer,
      context: this.context,
      logger: this.logger,
      monitor: this.monitor,
      L1_BLOCK_TIME_IN_S: this.L1_BLOCK_TIME_IN_S,
      L2_SLOT_DURATION_IN_S: this.L2_SLOT_DURATION_IN_S,
    } = this.test);
    this.node = this.context.aztecNode;
    this.archiver = (this.node as AztecNodeService).getBlockSource() as Archiver;
    this.from = this.context.accounts[0];
    this.contract = await this.test.registerTestContract(this.context.wallet);
  }

  public teardown(): Promise<void> {
    return this.test.teardown();
  }

  /** Pre-proves and sends `count` txs to generate L2 activity for multi-block checkpoints. */
  public async sendTransactions(count: number, offset = 0): Promise<TxHash[]> {
    this.logger.warn(`Pre-proving ${count} transactions`);
    const txs = await timesAsync(count, i =>
      proveInteraction(this.context.wallet, this.contract.methods.emit_nullifier(new Fr(offset + i + 1)), {
        from: this.from,
      }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    this.logger.warn(`Sent ${txHashes.length} transactions`);
    return txHashes;
  }
}

export { jest };
