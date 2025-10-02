import { getAddressingWithBaseTagIssueTx } from '@aztec/simulator/public/fixtures';

import { AvmProvingTester } from './avm_proving_tester.js';

describe('AVM custom bytecodes unhappy paths', () => {
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true);
  });

  it('Base address uninitialized indirect relative', async () => {
    const result = await getAddressingWithBaseTagIssueTx(/*isIndirect=*/ true);
    await tester.proveVerifyFromTxResult(
      result,
      /*expectRevert=*/ true,
      /*txLabel=*/ 'Base address uninitialized indirect relative',
    );
  }, 20_000);

  it('Base address uninitialized direct relative', async () => {
    const result = await getAddressingWithBaseTagIssueTx(/*isIndirect=*/ false);
    await tester.proveVerifyFromTxResult(
      result,
      /*expectRevert=*/ true,
      /*txLabel=*/ 'Base address uninitialized direct relative',
    );
  }, 20_000);
});
