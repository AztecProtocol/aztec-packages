import { Wallet } from '@aztec/aztec.js';
import { DelegatedOnContract, DelegatorContract } from '@aztec/noir-contracts.js';

import { setup } from './fixtures/utils.js';

describe('e2e_delegate_calls', () => {
  let wallet: Wallet;
  let delegatorContract: DelegatorContract;
  let delegatedOnContract: DelegatedOnContract;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown, wallet } = await setup());
  }, 100_000);

  afterEach(() => teardown());

  beforeEach(async () => {
    delegatorContract = await DelegatorContract.deploy(wallet).send().deployed();
    delegatedOnContract = await DelegatedOnContract.deploy(wallet).send().deployed();
  }, 100_000);

  describe('delegates on another contract', () => {
    it("runs another contract's code on delegator's storage", async () => {
      const sentValue = 42n;
      await delegatorContract.methods
        .private_delegate_set_value(
          delegatedOnContract.address,
          delegatedOnContract.methods.private_set_value.selector,
          [sentValue, wallet.getCompleteAddress().address],
        )
        .send()
        .wait();

      const delegatorValue = await delegatorContract.methods
        .view_value(sentValue, wallet.getCompleteAddress().address)
        .view();

      const delegatedOnValue = await delegatedOnContract.methods
        .view_private_value(sentValue, wallet.getCompleteAddress().address)
        .view();

      expect(delegatedOnValue).toEqual(0n);
      expect(delegatorValue).toEqual(sentValue);
    }, 100_000);
  });
});
