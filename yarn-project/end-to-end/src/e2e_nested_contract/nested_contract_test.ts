import { getSchnorrWallet } from '@aztec/accounts/schnorr';
import {
  type AccountWallet,
  AztecAddress,
  type CompleteAddress,
  type Logger,
  type PXE,
  createLogger,
} from '@aztec/aztec.js';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { ParentContract } from '@aztec/noir-test-contracts.js/Parent';

import {
  type ISnapshotManager,
  type SubsystemsContext,
  createSnapshotManager,
  deployAccounts,
  publicDeployAccounts,
} from '../fixtures/snapshot_manager.js';

const { E2E_DATA_PATH: dataPath } = process.env;

export class NestedContractTest {
  private snapshotManager: ISnapshotManager;
  logger: Logger;
  wallet!: AccountWallet;
  defaultAccountAddress!: AztecAddress;
  pxe!: PXE;

  parentContract!: ParentContract;
  childContract!: ChildContract;

  constructor(
    testName: string,
    private numberOfAccounts = 1,
  ) {
    this.logger = createLogger(`e2e:e2e_nested_contract:${testName}`);
    this.snapshotManager = createSnapshotManager(`e2e_nested_contract/${testName}-${numberOfAccounts}`, dataPath);
  }

  /**
   * Adds two state shifts to snapshot manager.
   * 1. Add 3 accounts.
   * 2. Publicly deploy accounts
   */
  async applyBaseSnapshots() {
    await this.snapshotManager.snapshot(
      'accounts',
      deployAccounts(this.numberOfAccounts, this.logger),
      async ({ deployedAccounts }, { pxe }) => {
        const wallets = await Promise.all(deployedAccounts.map(a => getSchnorrWallet(pxe, a.address, a.signingKey)));
        wallets.forEach((w, i) => this.logger.verbose(`Wallet ${i} address: ${w.getAddress()}`));
        [this.wallet] = wallets;
        this.defaultAccountAddress = this.wallet.getAddress();
        this.pxe = pxe;
      },
    );

    await this.snapshotManager.snapshot(
      'public_deploy',
      async () => {},
      async () => {
        this.logger.verbose(`Public deploy accounts...`);
        await publicDeployAccounts(this.wallet, [this.defaultAccountAddress]);
      },
    );
  }

  async setup() {
    await this.snapshotManager.setup();
  }

  async teardown() {
    await this.snapshotManager.teardown();
  }

  snapshot = <T>(
    name: string,
    apply: (context: SubsystemsContext) => Promise<T>,
    restore: (snapshotData: T, context: SubsystemsContext) => Promise<void> = () => Promise.resolve(),
  ): Promise<void> => this.snapshotManager.snapshot(name, apply, restore);

  async applyManualSnapshots() {
    await this.snapshotManager.snapshot(
      'manual',
      async () => {
        const parentContract = await ParentContract.deploy(this.wallet)
          .send({ from: this.defaultAccountAddress })
          .deployed();
        const childContract = await ChildContract.deploy(this.wallet)
          .send({ from: this.defaultAccountAddress })
          .deployed();
        return { parentContractAddress: parentContract.address, childContractAddress: childContract.address };
      },
      async ({ parentContractAddress, childContractAddress }) => {
        this.parentContract = await ParentContract.at(parentContractAddress, this.wallet);
        this.childContract = await ChildContract.at(childContractAddress, this.wallet);
      },
    );
  }
}
