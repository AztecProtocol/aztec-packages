import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import type { SlasherClientInterface } from '@aztec/slasher';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { setup } from '../fixtures/utils.js';

describe('e2e_slasher_config', () => {
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    ({ aztecNodeAdmin, aztecNode } = await setup(0, {
      slashInactivityTargetPercentage: 1,
      slashInactivityPenalty: 42n,
    }));

    if (!aztecNodeAdmin) {
      throw new Error('Aztec node admin API must be available for this test');
    }
  });

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
