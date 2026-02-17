import { AztecAddress } from '@aztec/aztec.js/addresses';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { ParentContract } from '@aztec/noir-test-contracts.js/Parent';

import {
  type EndToEndContext,
  deployAccounts,
  publicDeployAccounts,
  setup,
  teardown as teardownSubsystems,
} from '../fixtures/setup.js';

export class NestedContractTest {
  context!: EndToEndContext;
  logger: Logger;
  wallet!: Wallet;
  defaultAccountAddress!: AztecAddress;
  aztecNode!: AztecNode;

  parentContract!: ParentContract;
  childContract!: ChildContract;

  constructor(
    testName: string,
    private numberOfAccounts = 1,
  ) {
    this.logger = createLogger(`e2e:e2e_nested_contract:${testName}`);
  }

  /**
   * Applies base setup by deploying accounts and publicly deploying them.
   */
  async applyBaseSetup() {
    this.logger.info('Deploying accounts');
    const { deployedAccounts } = await deployAccounts(
      this.numberOfAccounts,
      this.logger,
    )({
      wallet: this.context.wallet,
      initialFundedAccounts: this.context.initialFundedAccounts,
    });
    this.wallet = this.context.wallet;
    [{ address: this.defaultAccountAddress }] = deployedAccounts;
    this.aztecNode = this.context.aztecNodeService;

    this.logger.info('Public deploy accounts');
    await publicDeployAccounts(this.wallet, [this.defaultAccountAddress]);
  }

  async setup() {
    this.logger.info('Setting up fresh subsystems');
    this.context = await setup(0, {
      fundSponsoredFPC: true,
      skipAccountDeployment: true,
    });
    await this.applyBaseSetup();
  }

  async teardown() {
    await teardownSubsystems(this.context);
  }

  async applyManual() {
    this.logger.info('Deploying parent and child contracts');
    const parentContract = await ParentContract.deploy(this.wallet).send({ from: this.defaultAccountAddress });
    const childContract = await ChildContract.deploy(this.wallet).send({ from: this.defaultAccountAddress });
    this.parentContract = parentContract;
    this.childContract = childContract;
  }
}
