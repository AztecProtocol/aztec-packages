import { Wallet } from '@aztec/aztec.js';
import { ChildContract, DelegateContract } from '@aztec/noir-contracts.js';

import { setup } from './fixtures/utils.js';

describe('e2e_delegate_calls', () => {
  let wallet: Wallet;
  let delegateContract: DelegateContract;
  let childContract: ChildContract;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown, wallet } = await setup());
  }, 100_000);

  afterEach(() => teardown());

  beforeEach(async () => {
    delegateContract = await DelegateContract.deploy(wallet).send().deployed();
    childContract = await ChildContract.deploy(wallet).send().deployed();
  }, 100_000);

  describe('delegates on another contract', () => {
    it("runs child contract's code on delegate's storage", async () => {
      const sentValue = 42n;
      await delegateContract.methods
        .private_delegate_set_value(childContract.address, childContract.methods.privateSetValue.selector, [
          sentValue,
          wallet.getCompleteAddress().address,
        ])
        .send()
        .wait();

      const delegateValue = await delegateContract.methods
        .private_get_value(sentValue, wallet.getCompleteAddress().address)
        .send()
        .wait();

      const childValue = await childContract.methods
        .privateGetValue(sentValue, wallet.getCompleteAddress().address)
        .send()
        .wait();

      expect(delegateValue).toEqual(sentValue);
      expect(childValue).not.toEqual(sentValue);
    }, 100_000);
  });
});
