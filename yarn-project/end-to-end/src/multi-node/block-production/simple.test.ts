import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { asyncMap } from '@aztec/foundation/async-map';
import { timesAsync } from '@aztec/foundation/collection';
import { executeTimeout } from '@aztec/foundation/timer';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';

import type { EndToEndContext } from '../../../fixtures/utils.js';
import { waitForTxs } from '../../../fixtures/wait_helpers.js';
import { proveInteraction } from '../../../test-wallet/utils.js';
import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MV_CONSENSUS_TIMING,
  MultiNodeTestContext,
  type RegisteredValidator,
  buildMockGossipValidators,
} from '../../multi_node_test_context.js';
import { NODE_COUNT, jest } from './setup.js';

const TX_COUNT_SIMPLE = 8;

// Verifies that 3 validator nodes can build blocks without sequencer errors. Lightweight RPC-only
// initial node (skipInitialSequencer), mockGossipSubNetwork, no prover. Timing: ethSlot=12s,
// aztecSlot=36s, epoch=default 6, proofSubmissionEpochs=1024, blockDurationMs=6s. Pre-proved txs sent
// from the hardcoded genesis-funded account (no on-chain account deploy needed).
describe('multi-node/consensus/block_building/simple', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: MultiNodeTestContext;
  let validators: RegisteredValidator[];
  let nodes: AztecNodeService[];
  let contract: TestContract;
  let from: AztecAddress;

  beforeEach(async () => {
    validators = buildMockGossipValidators(NODE_COUNT);

    // Setup context with no initial sequencer (lightweight RPC-only node).
    // The hardcoded account is funded via genesis without needing on-chain deployment.
    test = await MultiNodeTestContext.setup({
      ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
      ...MV_CONSENSUS_TIMING,
      initialValidators: validators,
    });

    ({ context, logger } = test);
    from = context.accounts[0]; // auto-created by setup

    // Register test contract locally for sending txs (no on-chain deployment needed).
    contract = await test.registerTestContract(context.wallet);

    // Start the validator nodes.
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { minTxsPerBlock: 1, maxTxsPerBlock: 1 }),
    );
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Pre-proves TX_COUNT transactions emitting unique nullifiers, sends them, waits for all to mine,
  // then asserts no fail events were emitted by any of the 3 sequencers during the run.
  it('builds simple blocks without any errors', async () => {
    const sequencers = nodes.map(node => node.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: validators[i].attester }));

    // Create and submit txs from the hardcoded account. Each tx emits a unique
    // nullifier, which is enough side-effect to produce a non-empty block.
    const txs = await timesAsync(TX_COUNT_SIMPLE, _i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(Fr.random()), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
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
