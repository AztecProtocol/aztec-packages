import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { executeTimeout } from '@aztec/foundation/timer';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForTxs } from '../../fixtures/wait_helpers.js';
import { proveAndSendTxs } from '../../test-wallet/utils.js';
import type { MultiNodeTestContext, RegisteredValidator } from '../multi_node_test_context.js';
import { jest, setupSimpleBlockProduction } from './setup.js';

const NODE_COUNT = 3;
const TX_COUNT_SIMPLE = 8;

// Verifies that 3 validator nodes can build blocks without sequencer errors. Lightweight RPC-only
// initial node (skipInitialSequencer), mockGossipSubNetwork, no prover. Timing: ethSlot=12s,
<<<<<<< HEAD
// aztecSlot=36s, epoch=default 6, proofSubmissionEpochs=1024, blockDurationMs=6s. Pre-proved txs sent
=======
// aztecSlot=24s, epoch=default 6, proofSubmissionEpochs=1024, blockDurationMs=4s. Pre-proved txs sent
>>>>>>> origin/v5-next
// from the hardcoded genesis-funded account (no on-chain account deploy needed).
describe('multi-node/block-production/simple', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: MultiNodeTestContext;
  let validators: RegisteredValidator[];
  let nodes: AztecNodeService[];
  let contract: TestContract;
  let from: AztecAddress;

  beforeEach(async () => {
    // Setup context with no initial sequencer (lightweight RPC-only node).
    // The hardcoded account is funded via genesis without needing on-chain deployment.
    ({ test, context, logger, validators, nodes, from } = await setupSimpleBlockProduction({
      nodeCount: NODE_COUNT,
      nodeOpts: { minTxsPerBlock: 1, maxTxsPerBlock: 1 },
    }));

    // Register test contract locally for sending txs (no on-chain deployment needed).
    contract = await test.registerTestContract(context.wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Pre-proves TX_COUNT transactions emitting unique nullifiers, sends them, waits for all to mine,
  // then asserts no fail events were emitted by any of the 3 sequencers during the run.
  it('builds simple blocks without any errors', async () => {
    const { failEvents } = test.watchNodeSequencerEvents(nodes);

    // Create and submit txs from the hardcoded account. Each tx emits a unique
    // nullifier, which is enough side-effect to produce a non-empty block.
    const txHashes = await proveAndSendTxs(
      context.wallet,
      TX_COUNT_SIMPLE,
      () => contract.methods.emit_nullifier(Fr.random()),
      { from },
    );
    logger.warn(`Sent ${txHashes.length} transactions`, {
      txs: txHashes,
    });

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * (TX_COUNT_SIMPLE * 2 + 1);
    await executeTimeout(() => waitForTxs(context.aztecNode, txHashes, { timeout }), timeout * 1000);
    logger.warn(`All txs have been mined`);

    // Expect no failures from sequencers during block building
    test.assertNoFailuresFromSequencers(failEvents);
  });
});
