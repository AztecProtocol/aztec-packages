import type { ContractArtifact } from '@aztec/aztec.js/abi';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { type ContractBase, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { PublicKeys } from '@aztec/aztec.js/keys';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { TestWallet } from '@aztec/test-wallet/server';

import { type SubsystemsContext, deployAccounts, setupFromFresh, teardown } from '../fixtures/snapshot_manager.js';

export class DeployTest {
  public context!: SubsystemsContext;
  public logger: Logger;
  public wallet!: TestWallet;
  public defaultAccountAddress!: AztecAddress;
  public aztecNode!: AztecNode;
  public aztecNodeAdmin!: AztecNodeAdmin;

  constructor(testName: string) {
    this.logger = createLogger(`e2e:e2e_deploy_contract:${testName}`);
  }

  async setup() {
    this.logger.info('Setting up test environment');
    this.context = await setupFromFresh(this.logger);
    this.aztecNode = this.context.aztecNode;
    this.wallet = this.context.wallet;
    this.aztecNodeAdmin = this.context.aztecNode;
    await this.applyInitialAccount();
    return this;
  }

  async teardown() {
    await teardown(this.context);
  }

  private async applyInitialAccount() {
    this.logger.info('Applying initial account setup');
    const { deployedAccounts } = await deployAccounts(
      1,
      this.logger,
    )({
      wallet: this.context.wallet,
      initialFundedAccounts: this.context.initialFundedAccounts,
    });
    this.defaultAccountAddress = deployedAccounts[0].address;
  }

  async registerContract<T extends ContractBase>(
    wallet: Wallet,
    contractArtifact: ContractArtifactClass<T>,
    opts: {
      salt?: Fr;
      publicKeys?: PublicKeys;
      initArgs?: any[];
      constructorName?: string;
      deployer?: AztecAddress;
    } = {},
  ): Promise<T> {
    const { salt, publicKeys, initArgs, constructorName, deployer } = opts;
    const instance = await getContractInstanceFromInstantiationParams(contractArtifact.artifact, {
      constructorArgs: initArgs ?? [],
      constructorArtifact: constructorName,
      salt: salt ?? Fr.random(),
      publicKeys,
      deployer,
    });
    await wallet.registerContract(instance, contractArtifact.artifact);
    return contractArtifact.at(instance.address, wallet);
  }
}

export type StatefulContractCtorArgs = Parameters<StatefulTestContract['methods']['constructor']>;

export type ContractArtifactClass<T extends ContractBase> = {
  at(address: AztecAddress, wallet: Wallet): T;
  artifact: ContractArtifact;
};
