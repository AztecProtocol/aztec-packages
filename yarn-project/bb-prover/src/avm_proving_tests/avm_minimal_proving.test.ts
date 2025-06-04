import { createAvmMinimalPublicTx } from '@aztec/simulator/public/fixtures';

import { AvmProvingTester, describeUnlessAvmDisabled } from './avm_proving_tester.js';

describeUnlessAvmDisabled('AVM minimal tx', () => {
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new();
  });

  it('Proving minimal public tx', async () => {
    const result = await createAvmMinimalPublicTx();
    expect(result.revertCode.isOK()).toBe(true);

    await tester.proveVerify(result.avmProvingRequest.inputs);
  }, 180_000);
});
