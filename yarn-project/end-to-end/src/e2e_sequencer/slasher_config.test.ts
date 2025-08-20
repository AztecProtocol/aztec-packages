import type { SlasherClientInterface } from '@aztec/slasher';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { setup } from '../fixtures/utils.js';

describe('e2e_slasher_config', () => {
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    ({ aztecNodeAdmin, aztecNode } = await setup(1, {
      slashInactivityCreateTargetPercentage: 1,
      slashInactivitySignalTargetPercentage: 1,
      slashInactivityEnabled: true,
      slashInactivityCreatePenalty: 42n,
    }));

    if (!aztecNodeAdmin) {
      throw new Error('Aztec node admin API must be available for this test');
    }
  });

  it('should update slasher config', async () => {
    const slasherClient = (aztecNode as any).slasherClient as SlasherClientInterface;
    const currentConfig = slasherClient.getConfig();
    expect(currentConfig.slashInactivityCreateTargetPercentage).toBe(1);
    expect(currentConfig.slashInactivitySignalTargetPercentage).toBe(1);
    expect(currentConfig.slashInactivityCreatePenalty).toBe(42n);
    expect(currentConfig.slashInactivityEnabled).toBe(true);
    await aztecNodeAdmin!.setConfig({
      slashInactivityCreateTargetPercentage: 0.9,
      slashInactivitySignalTargetPercentage: 0.6,
    });
    const updatedConfig = slasherClient.getConfig();
    expect(updatedConfig.slashInactivityCreateTargetPercentage).toBe(0.9);
    expect(updatedConfig.slashInactivitySignalTargetPercentage).toBe(0.6);
    expect(updatedConfig.slashInactivityCreatePenalty).toBe(42n);
    expect(updatedConfig.slashInactivityEnabled).toBe(true);
  });
});
