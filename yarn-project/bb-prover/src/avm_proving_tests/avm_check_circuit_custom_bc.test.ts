import { addressingWithBaseTagIssueTest, defaultGlobals } from '@aztec/simulator/public/fixtures';

import { AvmProvingTester } from './avm_proving_tester.js';

describe('AVM custom bytecodes unhappy paths', () => {
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true, /*globals=*/ defaultGlobals());
  });

  it('Base address uninitialized indirect relative', async () => {
    await addressingWithBaseTagIssueTest(/*isIndirect=*/ true, tester);
  }, 20_000);

  it('Base address uninitialized direct relative', async () => {
    await addressingWithBaseTagIssueTest(/*isIndirect=*/ false, tester);
  }, 20_000);
});
