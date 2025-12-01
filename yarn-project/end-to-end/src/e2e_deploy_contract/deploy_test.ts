import type { ContractArtifact } from '@aztec/aztec.js/abi';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { type ContractBase, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { PublicKeys } from '@aztec/aztec.js/keys';
import { createLogger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';

import { BaseEndToEndTest } from '../fixtures/base_end_to_end_test.js';

export class DeployTest extends BaseEndToEndTest {
  public defaultAccountAddress!: AztecAddress;

  constructor(testName: string) {
    super(testName, createLogger(`e2e:e2e_deploy_contract:${testName}`));
  }

  override async setup() {
    await super.setup(1);
    this.initializeAccount();
    return this;
  }

  private initializeAccount() {
    this.defaultAccountAddress = this.accounts[0];
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
