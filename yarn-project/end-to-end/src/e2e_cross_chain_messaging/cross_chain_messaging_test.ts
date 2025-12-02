import type { AztecNodeConfig } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { createLogger } from '@aztec/aztec.js/log';
import { type ExtendedViemWalletClient, createExtendedL1Client, deployL1Contract } from '@aztec/ethereum';
import { InboxAbi, OutboxAbi, TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBridgeContract } from '@aztec/noir-contracts.js/TokenBridge';

import { getContract } from 'viem';

import { BaseEndToEndTest } from '../fixtures/base_end_to_end_test.js';
import { MNEMONIC } from '../fixtures/fixtures.js';
import { type SetupOptions, ensureAccountContractsPublished } from '../fixtures/utils.js';
import { CrossChainTestHarness } from '../shared/cross_chain_test_harness.js';

export class CrossChainMessagingTest extends BaseEndToEndTest {
  // Properties inherited from BaseEndToEndTest:
  // - aztecNode, wallet, cheatCodes, deployL1ContractsValues, logger

  aztecNodeConfig!: AztecNodeConfig;
  l1Client!: ExtendedViemWalletClient | undefined;

  ownerAddress!: AztecAddress;
  user1Address!: AztecAddress;
  user2Address!: AztecAddress;
  crossChainTestHarness!: CrossChainTestHarness;
  ethAccount!: EthAddress;
  l2Token!: TokenContract;
  l2Bridge!: TokenBridgeContract;

  inbox!: any; // GetContractReturnType<typeof InboxAbi> | undefined;
  outbox!: any; // GetContractReturnType<typeof OutboxAbi> | undefined;

  private setupOptions: SetupOptions;

  // Expose ctx for backward compatibility with existing tests
  get ctx() {
    return this.context;
  }

  constructor(testName: string, opts: SetupOptions = {}) {
    super(testName, createLogger(`e2e:e2e_cross_chain_messaging:${testName}`));
    this.setupOptions = opts;
  }

  async assumeProven() {
    await this.cheatCodes.rollup.markAsProven();
  }

  override async setup(): Promise<this> {
    await super.setup(3, this.setupOptions);
    this.aztecNodeConfig = this.context.config;
    this.aztecNodeAdmin = this.context.aztecNodeAdmin;
    await this.setupCrossChainInfrastructure();
    return this;
  }

  async setupCrossChainInfrastructure() {
    // Accounts are already deployed by setup() - just assign them
    [this.ownerAddress, this.user1Address, this.user2Address] = this.accounts.slice(0, 3);

    // Public deploy accounts
    this.logger.verbose(`Public deploy accounts...`);
    await ensureAccountContractsPublished(this.wallet, [this.ownerAddress, this.user1Address, this.user2Address]);

    // Create L1 client
    this.l1Client = createExtendedL1Client(this.aztecNodeConfig.l1RpcUrls, MNEMONIC);

    // Deploy underlying ERC20
    const underlyingERC20Address = await deployL1Contract(this.l1Client, TestERC20Abi, TestERC20Bytecode, [
      'Underlying',
      'UND',
      this.l1Client.account.address,
    ]).then(({ address }) => address);

    // Setup cross chain harness
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

    // Get the cross chain context
    const crossChainContext = this.crossChainTestHarness.toCrossChainContext();

    // Restore logic - setup contracts from context
    this.l2Token = TokenContract.at(crossChainContext.l2Token, this.wallet);
    this.l2Bridge = TokenBridgeContract.at(crossChainContext.l2Bridge, this.wallet);

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
  }
}
