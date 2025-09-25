import type { AztecNodeConfig } from '@aztec/aztec-node';
import { AztecAddress, type AztecNode, EthAddress, type Logger, createLogger } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec/testing';
import {
  type DeployL1ContractsArgs,
  type DeployL1ContractsReturnType,
  type ExtendedViemWalletClient,
  createExtendedL1Client,
  deployL1Contract,
} from '@aztec/ethereum';
import { InboxAbi, OutboxAbi, TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBridgeContract } from '@aztec/noir-contracts.js/TokenBridge';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { TestWallet } from '@aztec/test-wallet/server';

import { getContract } from 'viem';

import { MNEMONIC } from '../fixtures/fixtures.js';
import {
  type ISnapshotManager,
  type SubsystemsContext,
  createSnapshotManager,
  deployAccounts,
  publicDeployAccounts,
} from '../fixtures/snapshot_manager.js';
import type { SetupOptions } from '../fixtures/utils.js';
import { CrossChainTestHarness } from '../shared/cross_chain_test_harness.js';

const { E2E_DATA_PATH: dataPath } = process.env;

export class CrossChainMessagingTest {
  private snapshotManager: ISnapshotManager;
  logger: Logger;
  aztecNode!: AztecNode;
  aztecNodeConfig!: AztecNodeConfig;
  aztecNodeAdmin!: AztecNodeAdmin;
  ctx!: SubsystemsContext;

  l1Client!: ExtendedViemWalletClient | undefined;

  wallet!: TestWallet;
  ownerAddress!: AztecAddress;
  user1Address!: AztecAddress;
  user2Address!: AztecAddress;
  crossChainTestHarness!: CrossChainTestHarness;
  ethAccount!: EthAddress;
  l2Token!: TokenContract;
  l2Bridge!: TokenBridgeContract;

  inbox!: any; // GetContractReturnType<typeof InboxAbi> | undefined;
  outbox!: any; // GetContractReturnType<typeof OutboxAbi> | undefined;
  cheatCodes!: CheatCodes;

  deployL1ContractsValues!: DeployL1ContractsReturnType;

  constructor(testName: string, opts: SetupOptions = {}, deployL1ContractsArgs: Partial<DeployL1ContractsArgs> = {}) {
    this.logger = createLogger(`e2e:e2e_cross_chain_messaging:${testName}`);
    this.snapshotManager = createSnapshotManager(`e2e_cross_chain_messaging/${testName}`, dataPath, opts, {
      initialValidators: [],
      ...deployL1ContractsArgs,
    });
  }

  async assumeProven() {
    await this.cheatCodes.rollup.markAsProven();
  }

  async setup() {
    this.ctx = await this.snapshotManager.setup();
    this.aztecNode = this.ctx.aztecNode;
    this.wallet = this.ctx.wallet;
    this.aztecNodeConfig = this.ctx.aztecNodeConfig;
    this.cheatCodes = this.ctx.cheatCodes;
    this.deployL1ContractsValues = this.ctx.deployL1ContractsValues;
    this.aztecNodeAdmin = this.ctx.aztecNode;
  }

  snapshot = <T>(
    name: string,
    apply: (context: SubsystemsContext) => Promise<T>,
    restore: (snapshotData: T, context: SubsystemsContext) => Promise<void> = () => Promise.resolve(),
  ): Promise<void> => this.snapshotManager.snapshot(name, apply, restore);

  async teardown() {
    await this.snapshotManager.teardown();
  }

  async applyBaseSnapshots() {
    // Note that we are using the same `wallet`, `aztecNodeConfig` and `aztecNode` across all snapshots.
    // This is to not have issues with different networks.

    await this.snapshotManager.snapshot(
      '3_accounts',
      deployAccounts(3, this.logger),
      ({ deployedAccounts }, { wallet, aztecNodeConfig, aztecNode }) => {
        [this.ownerAddress, this.user1Address, this.user2Address] = deployedAccounts.map(a => a.address);
        this.wallet = wallet;
        this.aztecNode = aztecNode;
        this.aztecNodeConfig = aztecNodeConfig;
        return Promise.resolve();
      },
    );

    await this.snapshotManager.snapshot(
      'e2e_cross_chain_messaging',
      async () => {
        // Create the token contract state.
        // Move this account thing to addAccounts above?
        this.logger.verbose(`Public deploy accounts...`);
        await publicDeployAccounts(this.wallet, [this.ownerAddress, this.user1Address, this.user2Address]);

        this.l1Client = createExtendedL1Client(this.aztecNodeConfig.l1RpcUrls, MNEMONIC);

        const underlyingERC20Address = await deployL1Contract(this.l1Client, TestERC20Abi, TestERC20Bytecode, [
          'Underlying',
          'UND',
          this.l1Client.account.address,
        ]).then(({ address }) => address);

        this.logger.verbose(`Setting up cross chain harness...`);
        this.crossChainTestHarness = await CrossChainTestHarness.new(
          this.aztecNode,
          this.l1Client,
          this.wallet,
          this.ownerAddress,
          this.logger,
          underlyingERC20Address,
        );

        this.logger.verbose(`L2 token deployed to: ${this.crossChainTestHarness.l2Token.address}`);

        return this.crossChainTestHarness.toCrossChainContext();
      },
      async crossChainContext => {
        this.l2Token = await TokenContract.at(crossChainContext.l2Token, this.wallet);
        this.l2Bridge = await TokenBridgeContract.at(crossChainContext.l2Bridge, this.wallet);

        // There is an issue with the reviver so we are getting strings sometimes. Working around it here.
        this.ethAccount = EthAddress.fromString(crossChainContext.ethAccount.toString());
        const tokenPortalAddress = EthAddress.fromString(crossChainContext.tokenPortal.toString());

        const l1Client = createExtendedL1Client(this.aztecNodeConfig.l1RpcUrls, MNEMONIC);

        const inbox = getContract({
          address: this.aztecNodeConfig.l1Contracts.inboxAddress.toString(),
          abi: InboxAbi,
          client: l1Client,
        });
        const outbox = getContract({
          address: this.aztecNodeConfig.l1Contracts.outboxAddress.toString(),
          abi: OutboxAbi,
          client: l1Client,
        });

        this.crossChainTestHarness = new CrossChainTestHarness(
          this.aztecNode,
          this.logger,
          this.l2Token,
          this.l2Bridge,
          this.ethAccount,
          tokenPortalAddress,
          crossChainContext.underlying,
          l1Client,
          this.aztecNodeConfig.l1Contracts,
          this.wallet,
          this.ownerAddress,
        );

        this.l1Client = l1Client;
        this.inbox = inbox;
        this.outbox = outbox;
      },
    );
  }
}
