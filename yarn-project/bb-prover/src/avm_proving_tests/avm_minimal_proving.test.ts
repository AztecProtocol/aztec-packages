import { simAvmMinimalPublicTx } from '@aztec/simulator/public/fixtures';

import { AvmProvingTester } from './avm_proving_tester.js';

describe('AVM proven minimal tx', () => {
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new();
  });

  it('Proving minimal public tx', async () => {
    const result = await simAvmMinimalPublicTx();
    expect(result.revertCode.isOK()).toBe(true);

    await tester.proveVerify(result.avmProvingRequest.inputs);
  }, 180_000);
});
