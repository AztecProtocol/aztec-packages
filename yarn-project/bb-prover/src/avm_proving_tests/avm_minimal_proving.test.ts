import { executeAvmMinimalPublicTx } from '@aztec/simulator/public/fixtures';
import type { NativeWorldStateService } from '@aztec/world-state';

import { AvmProvingTester, createTmpWorldState } from './avm_proving_tester.js';

describe('AVM proven minimal tx', () => {
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;

  beforeEach(async () => {
    worldStateService = await createTmpWorldState();
    tester = await AvmProvingTester.new(worldStateService);
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('Proving minimal public tx', async () => {
    const result = await executeAvmMinimalPublicTx(tester);
    expect(result.revertCode.isOK()).toBe(true);
  }, 180_000);
});
