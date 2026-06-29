import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import type { SlasherClientInterface } from '@aztec/slasher';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { setupBlockProducer } from '../setup.js';
import type { SingleNodeTestContext } from '../single_node_test_context.js';

// Tests that slasher configuration can be updated at runtime via the node admin API.
// Single node with no accounts, PIPELINING_SETUP_OPTS (ethSlot=4s, aztecSlot=12s),
// slasher enabled with custom inactivity config. No block building exercised.
describe('single-node/sequencer/slasher_config', () => {
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let aztecNode: AztecNode;
  let test: SingleNodeTestContext;

  beforeAll(async () => {
    test = await setupBlockProducer({
      ...PIPELINING_SETUP_OPTS,
      anvilSlotsInAnEpoch: 4,
      slashInactivityTargetPercentage: 1,
      slashInactivityPenalty: 42n,
    });
    ({ aztecNodeAdmin, aztecNode } = test.context);

    if (!aztecNodeAdmin) {
      throw new Error('Aztec node admin API must be available for this test');
    }
  });

  afterAll(() => test.teardown());

  // Reads the initial slasher config from the running node's slasher client, calls setConfig() via
  // the admin API to update slashInactivityTargetPercentage, and asserts the new value is reflected
  // while slashInactivityPenalty remains unchanged.
  it('should update slasher config', async () => {
    const slasherClient = (aztecNode as TestAztecNodeService).slasherClient as SlasherClientInterface;
    expect(slasherClient).toBeDefined();
    const currentConfig = slasherClient.getConfig();
    expect(currentConfig.slashInactivityTargetPercentage).toBe(1);
    expect(currentConfig.slashInactivityPenalty).toBe(42n);
    await aztecNodeAdmin!.setConfig({ slashInactivityTargetPercentage: 0.9 });
    const updatedConfig = slasherClient.getConfig();
    expect(updatedConfig.slashInactivityTargetPercentage).toBe(0.9);
    expect(updatedConfig.slashInactivityPenalty).toBe(42n);
  });
});
