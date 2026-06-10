import { AztecAddress } from '@aztec/aztec.js/addresses';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { ParentContract } from '@aztec/noir-test-contracts.js/Parent';

import { type EndToEndContext, type SetupOptions, setup, teardown as teardownSubsystems } from '../fixtures/setup.js';

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

  async setup(opts: Partial<SetupOptions> = {}) {
    this.logger.info('Setting up fresh subsystems');
    // setup creates `numberOfAccounts` initializerless accounts, available on the context.
    this.context = await setup(this.numberOfAccounts, {
      ...opts,
      fundSponsoredFPC: true,
    });
    this.wallet = this.context.wallet;
    this.defaultAccountAddress = this.context.accounts[0];
    this.aztecNode = this.context.aztecNodeService;
  }

  async teardown() {
    await teardownSubsystems(this.context);
  }

  async applyManual() {
    this.logger.info('Deploying parent and child contracts');
    ({ contract: this.parentContract } = await ParentContract.deploy(this.wallet).send({
      from: this.defaultAccountAddress,
    }));
    ({ contract: this.childContract } = await ChildContract.deploy(this.wallet).send({
      from: this.defaultAccountAddress,
    }));
  }
}
