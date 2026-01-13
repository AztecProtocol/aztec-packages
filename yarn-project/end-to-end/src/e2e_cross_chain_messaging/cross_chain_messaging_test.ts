import type { AztecNodeConfig } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { waitForProven } from '@aztec/aztec.js/contracts';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { TxReceipt } from '@aztec/aztec.js/tx';
import { CheatCodes } from '@aztec/aztec/testing';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { InboxContract, OutboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type {
  DeployAztecL1ContractsArgs,
  DeployAztecL1ContractsReturnType,
} from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { sleep } from '@aztec/foundation/sleep';
import { TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBridgeContract } from '@aztec/noir-contracts.js/TokenBridge';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { TestWallet } from '@aztec/test-wallet/server';

import { MNEMONIC } from '../fixtures/fixtures.js';
import {
  type SubsystemsContext,
  deployAccounts,
  publicDeployAccounts,
  setupFromFresh,
  teardown,
} from '../fixtures/snapshot_manager.js';
import type { SetupOptions } from '../fixtures/utils.js';
import { CrossChainTestHarness } from '../shared/cross_chain_test_harness.js';

export class CrossChainMessagingTest {
  private requireEpochProven: boolean;
  private setupOptions: SetupOptions;
  private deployL1ContractsArgs: Partial<DeployAztecL1ContractsArgs>;
  logger: Logger;
  context!: SubsystemsContext;
  aztecNode!: AztecNode;
  aztecNodeConfig!: AztecNodeConfig;
  aztecNodeAdmin!: AztecNodeAdmin;

  l1Client!: ExtendedViemWalletClient | undefined;

  wallet!: TestWallet;
  ownerAddress!: AztecAddress;
  user1Address!: AztecAddress;
  user2Address!: AztecAddress;
  crossChainTestHarness!: CrossChainTestHarness;
  ethAccount!: EthAddress;
  l2Token!: TokenContract;
  l2Bridge!: TokenBridgeContract;

  rollup!: RollupContract;
  inbox!: InboxContract;
  outbox!: OutboxContract;
  cheatCodes!: CheatCodes;

  deployL1ContractsValues!: DeployAztecL1ContractsReturnType;

  constructor(
    testName: string,
    opts: SetupOptions = {},
    deployL1ContractsArgs: Partial<DeployAztecL1ContractsArgs> = {},
  ) {
    this.logger = createLogger(`e2e:e2e_cross_chain_messaging:${testName}`);
    this.setupOptions = opts;
    this.deployL1ContractsArgs = {
      initialValidators: [],
      ...deployL1ContractsArgs,
    };
    this.requireEpochProven = opts.startProverNode ?? false;
  }

  async setup() {
    this.logger.info('Setting up cross chain messaging test');
    this.context = await setupFromFresh(this.logger, this.setupOptions, this.deployL1ContractsArgs);
    await this.applyBaseSetup();
  }

  async advanceToEpochProven(l2TxReceipt: TxReceipt): Promise<EpochNumber> {
    const epoch = await this.rollup.getEpochNumberForCheckpoint(
      CheckpointNumber.fromBlockNumber(l2TxReceipt.blockNumber!),
    );
    // Warp to the next epoch.
    await this.cheatCodes.rollup.advanceToEpoch(EpochNumber(epoch + 1));
    // Wait for the tx to be proven.
    await waitForProven(this.aztecNode, l2TxReceipt, { provenTimeout: 300 });
    // Return the epoch the tx is in.
    return epoch;
  }

  async catchUpProvenChain() {
    const bn = await this.aztecNode.getBlockNumber();
    while ((await this.aztecNode.getProvenBlockNumber()) < bn) {
      await sleep(1000);
    }
  }

  async teardown() {
    await teardown(this.context);
  }

  async applyBaseSetup() {
    // Set up base context fields
    this.aztecNode = this.context.aztecNode;
    this.wallet = this.context.wallet;
    this.aztecNodeConfig = this.context.aztecNodeConfig;
    this.cheatCodes = this.context.cheatCodes;
    this.deployL1ContractsValues = this.context.deployL1ContractsValues;
    this.aztecNodeAdmin = this.context.aztecNode;

    if (this.requireEpochProven) {
      // Turn off the watcher to prevent it from keep marking blocks as proven.
      this.context.watcher.setIsMarkingAsProven(false);
    }

    // Deploy 3 accounts
    this.logger.info('Applying 3_accounts setup');
    const { deployedAccounts } = await deployAccounts(
      3,
      this.logger,
    )({
      wallet: this.context.wallet,
      initialFundedAccounts: this.context.initialFundedAccounts,
    });
    [this.ownerAddress, this.user1Address, this.user2Address] = deployedAccounts.map(a => a.address);

    // Set up cross chain messaging
    this.logger.info('Applying e2e_cross_chain_messaging setup');

    // Create the token contract state.
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

    const crossChainContext = this.crossChainTestHarness.toCrossChainContext();

    this.l2Token = TokenContract.at(crossChainContext.l2Token, this.wallet);
    this.l2Bridge = TokenBridgeContract.at(crossChainContext.l2Bridge, this.wallet);

    // There is an issue with the reviver so we are getting strings sometimes. Working around it here.
    this.ethAccount = EthAddress.fromString(crossChainContext.ethAccount.toString());
    const tokenPortalAddress = EthAddress.fromString(crossChainContext.tokenPortal.toString());

    const l1Client = createExtendedL1Client(this.aztecNodeConfig.l1RpcUrls, MNEMONIC);
    this.l1Client = l1Client;

    const l1Contracts = this.aztecNodeConfig.l1Contracts;
    this.rollup = new RollupContract(l1Client, l1Contracts.rollupAddress.toString());
    this.inbox = new InboxContract(l1Client, l1Contracts.inboxAddress.toString());
    this.outbox = new OutboxContract(l1Client, l1Contracts.outboxAddress.toString());

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
  }
}
