import { DelegateCallsTest } from './delegate_calls_test.js';

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/6423): delegate call not implemented.
describe.skip('e2e_delegate_calls', () => {
  const t = new DelegateCallsTest('delegate_calls');
  let { delegatorContract, delegatedOnContract, wallet } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ delegatorContract, delegatedOnContract, wallet } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  describe('delegates on another contract', () => {
    it("runs another contract's private function on delegator's storage", async () => {
      const sentValue = 42n;
      await delegatorContract.methods
        .private_delegate_set_value(delegatedOnContract.address, sentValue, wallet.getCompleteAddress().address)
        .send()
        .wait();

      const delegatorValue = await delegatorContract.methods
        .get_private_value(sentValue, wallet.getCompleteAddress().address)
        .simulate();

      await expect(
        delegatedOnContract.methods.get_private_value(sentValue, wallet.getCompleteAddress().address).simulate(),
      ).rejects.toThrow(`Assertion failed: Attempted to read past end of BoundedVec 'num_notes != 0'`);

      expect(delegatorValue).toEqual(sentValue);
    });
  });
});
