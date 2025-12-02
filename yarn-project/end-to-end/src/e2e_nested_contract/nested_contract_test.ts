import { AztecAddress } from '@aztec/aztec.js/addresses';
import { createLogger } from '@aztec/aztec.js/log';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { ParentContract } from '@aztec/noir-test-contracts.js/Parent';

import { BaseEndToEndTest } from '../fixtures/base_end_to_end_test.js';
import { ensureAccountContractsPublished } from '../fixtures/utils.js';

export class NestedContractTest extends BaseEndToEndTest {
  defaultAccountAddress!: AztecAddress;

  parentContract!: ParentContract;
  childContract!: ChildContract;

  constructor(
    testName: string,
    private numberOfAccounts = 1,
  ) {
    super(testName, createLogger(`e2e:e2e_nested_contract:${testName}`));
  }

  /**
   * Sets up base state:
   * 1. Add accounts.
   * 2. Publicly deploy accounts
   */
  async publishAccountContracts() {
    this.defaultAccountAddress = this.accounts[0];

    this.logger.verbose(`Public deploy accounts...`);
    await ensureAccountContractsPublished(this.wallet, [this.defaultAccountAddress]);
  }

  override async setup(): Promise<this> {
    await super.setup(this.numberOfAccounts);
    await this.publishAccountContracts();
    return this;
  }

  async deployContracts() {
    const parentContract = await ParentContract.deploy(this.wallet)
      .send({ from: this.defaultAccountAddress })
      .deployed();
    const childContract = await ChildContract.deploy(this.wallet).send({ from: this.defaultAccountAddress }).deployed();

    this.parentContract = ParentContract.at(parentContract.address, this.wallet);
    this.childContract = ChildContract.at(childContract.address, this.wallet);
  }
}
