import { createAvmMinimalPublicTx } from '@aztec/simulator/public/fixtures';

import { AvmProvingTester } from './avm_proving_tester.js';

describe('AVM minimal tx', () => {
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly=*/ true);
  });

  it('Proving minimal public tx', async () => {
    const result = await createAvmMinimalPublicTx();
    expect(result.revertCode.isOK()).toBe(true);

    await tester.proveVerify(result.avmProvingRequest.inputs);
  }, 180_000);
});
