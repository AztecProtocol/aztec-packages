import { createAvmMinimalPublicTx } from '@aztec/simulator/public/fixtures';

import { AvmProvingTesterV2 } from './avm_proving_tester.js';

describe('AVM v2', () => {
  let tester: AvmProvingTesterV2;

  beforeEach(async () => {
    tester = await AvmProvingTesterV2.new();
  });

  it('Proving minimal public tx', async () => {
    const result = await createAvmMinimalPublicTx();
    expect(result.revertCode.isOK()).toBe(true);

    await tester.proveVerifyV2(result.avmProvingRequest.inputs);
  }, 180_000);
});
