import { getSchnorrWallet } from '@aztec/accounts/schnorr';
import {
  type AccountWallet,
  type AztecAddress,
  type AztecNode,
  type ContractArtifact,
  type ContractBase,
  Fr,
  type Logger,
  type PXE,
  type PublicKeys,
  type Wallet,
  createLogger,
  getContractInstanceFromDeployParams,
} from '@aztec/aztec.js';
import type { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { type ISnapshotManager, createSnapshotManager, deployAccounts } from '../fixtures/snapshot_manager.js';

const { E2E_DATA_PATH: dataPath } = process.env;

export class DeployTest {
  private snapshotManager: ISnapshotManager;
  private wallets: AccountWallet[] = [];

  public logger: Logger;
  public pxe!: PXE;
  public wallet!: AccountWallet;
  public aztecNode!: AztecNode;
  public aztecNodeAdmin!: AztecNodeAdmin;

  constructor(testName: string) {
    this.logger = createLogger(`e2e:e2e_deploy_contract:${testName}`);
    this.snapshotManager = createSnapshotManager(`e2e_deploy_contract/${testName}`, dataPath);
  }

  async setup() {
    await this.applyInitialAccountSnapshot();
    const context = await this.snapshotManager.setup();
    ({ pxe: this.pxe, aztecNode: this.aztecNode } = context);
    this.aztecNodeAdmin = context.aztecNode;
    return this;
  }

  async teardown() {
    await this.snapshotManager.teardown();
  }

  private async applyInitialAccountSnapshot() {
    await this.snapshotManager.snapshot(
      'initial_account',
      deployAccounts(1, this.logger),
      async ({ deployedAccounts }, { pxe }) => {
        this.wallets = await Promise.all(deployedAccounts.map(a => getSchnorrWallet(pxe, a.address, a.signingKey)));
        this.wallets.forEach((w, i) => this.logger.verbose(`Wallet ${i} address: ${w.getAddress()}`));
        this.wallet = this.wallets[0];
      },
    );
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
    const instance = await getContractInstanceFromDeployParams(contractArtifact.artifact, {
      constructorArgs: initArgs ?? [],
      constructorArtifact: constructorName,
      salt,
      publicKeys,
      deployer,
    });
    await wallet.registerContract({ artifact: contractArtifact.artifact, instance });
    return contractArtifact.at(instance.address, wallet);
  }

  async registerRandomAccount(): Promise<AztecAddress> {
    const completeAddress = await this.pxe.registerAccount(Fr.random(), Fr.random());
    return completeAddress.address;
  }
}

export type StatefulContractCtorArgs = Parameters<StatefulTestContract['methods']['constructor']>;

export type ContractArtifactClass<T extends ContractBase> = {
  at(address: AztecAddress, wallet: Wallet): Promise<T>;
  artifact: ContractArtifact;
};
