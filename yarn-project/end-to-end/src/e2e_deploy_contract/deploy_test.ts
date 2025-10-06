import {
  type AztecAddress,
  type AztecNode,
  type ContractArtifact,
  type ContractBase,
  Fr,
  type Logger,
  type PublicKeys,
  type Wallet,
  createLogger,
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js';
import type { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { TestWallet } from '@aztec/test-wallet/server';

import { type ISnapshotManager, createSnapshotManager, deployAccounts } from '../fixtures/snapshot_manager.js';

const { E2E_DATA_PATH: dataPath } = process.env;

export class DeployTest {
  private snapshotManager: ISnapshotManager;
  public logger: Logger;
  public wallet!: TestWallet;
  public defaultAccountAddress!: AztecAddress;
  public aztecNode!: AztecNode;
  public aztecNodeAdmin!: AztecNodeAdmin;

  constructor(testName: string) {
    this.logger = createLogger(`e2e:e2e_deploy_contract:${testName}`);
    this.snapshotManager = createSnapshotManager(`e2e_deploy_contract/${testName}`, dataPath);
  }

  async setup() {
    await this.applyInitialAccountSnapshot();
    const context = await this.snapshotManager.setup();
    ({ aztecNode: this.aztecNode, wallet: this.wallet } = context);
    this.aztecNodeAdmin = context.aztecNode;
    return this;
  }

  async teardown() {
    await this.snapshotManager.teardown();
  }

  private async applyInitialAccountSnapshot() {
    await this.snapshotManager.snapshot('initial_account', deployAccounts(1, this.logger), ({ deployedAccounts }) => {
      this.defaultAccountAddress = deployedAccounts[0].address;
      return Promise.resolve();
    });
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
  at(address: AztecAddress, wallet: Wallet): Promise<T>;
  artifact: ContractArtifact;
};
