import { type DebugLogger, createDebugLogger } from '@aztec/aztec.js';
import { makeRandomEpochProofQuote } from '@aztec/p2p';

import { beforeAll } from '@jest/globals';

import {
  type ISnapshotManager,
  type SubsystemsContext,
  addAccounts,
  createSnapshotManager,
} from '../fixtures/snapshot_manager.js';

// Tests simple block building with a sequencer that does not upload proofs to L1,
// and then follows with a prover node run (with real proofs disabled, but
// still simulating all circuits via a prover-client), in order to test
// the coordination through L1 between the sequencer and the prover node.
describe('e2e_prover_node', () => {
  let ctx: SubsystemsContext;

  let logger: DebugLogger;
  let snapshotManager: ISnapshotManager;

  beforeAll(async () => {
    logger = createDebugLogger('aztec:prover_coordination:e2e_json_coordination');
    snapshotManager = createSnapshotManager(`prover_coordination/e2e_json_coordination`, process.env.E2E_DATA_PATH);

    await snapshotManager.snapshot('setup', addAccounts(2, logger));

    ctx = await snapshotManager.setup();
  });

  it('Prover can submit an EpochProofQuote to the node via jsonrpc', async () => {
    const { quote } = makeRandomEpochProofQuote();

    await ctx.proverNode.sendEpochProofQuote(quote);
    const receivedQuotes = await ctx.aztecNode.getEpochProofQuotes(quote.payload.epochToProve);
    expect(receivedQuotes.length).toBe(1);
    expect(receivedQuotes[0]).toEqual(quote);
  });
});
