import type { AztecNodeConfig } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { waitForProven } from '@aztec/aztec.js/contracts';
import { createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { TxReceipt } from '@aztec/aztec.js/tx';
import { CheatCodes, EpochTestSettler } from '@aztec/aztec/testing';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { InboxContract, OutboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type {
  DeployAztecL1ContractsArgs,
  DeployAztecL1ContractsReturnType,
} from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import { pickL1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBridgeContract } from '@aztec/noir-contracts.js/TokenBridge';
import type { PXEConfig } from '@aztec/pxe/server';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { MNEMONIC } from '../../fixtures/fixtures.js';
import { type SetupOptions, ensureAuthRegistryPublished, setup } from '../../fixtures/setup.js';
import { CrossChainTestHarness } from '../../shared/cross_chain_test_harness.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { SingleNodeTestContext, type SingleNodeTestOpts } from '../single_node_test_context.js';

/**
 * The cross-chain-messaging harness over the single-node topology: extends {@link SingleNodeTestContext}
 * so it reuses the base node tracking / chain monitor / teardown machinery, but builds its environment
 * with the bespoke cross-chain opts below (optional prover node, sponsored-FPC funding, a generous
 * prover tx-gathering window for the epoch warps) rather than the base's default node config, and owns
 * the {@link CrossChainTestHarness} domain object plus the L1 inbox/outbox handles.
 */
export class CrossChainMessagingTest extends SingleNodeTestContext {
  private requireEpochProven: boolean;
  private setupOptions: SetupOptions;
  private deployL1ContractsArgs: Partial<DeployAztecL1ContractsArgs>;
  private pxeOpts: Partial<PXEConfig>;
  private l1HarnessAccountIndex?: number;
  private testName: string;
  aztecNode!: AztecNode;
  aztecNodeConfig!: AztecNodeConfig;
  aztecNodeAdmin!: AztecNodeAdmin;

  wallet!: TestWallet;
  ownerAddress!: AztecAddress;
  user1Address!: AztecAddress;
  user2Address!: AztecAddress;
  crossChainTestHarness!: CrossChainTestHarness;
  ethAccount!: EthAddress;
  l2Token!: TokenContract;
  l2Bridge!: TokenBridgeContract;

  inbox!: InboxContract;
  outbox!: OutboxContract;
  cheatCodes!: CheatCodes;

  /**
   * Background loop that marks each completed epoch as proven on L1. Started in `applyBaseSetup`
   * when the test runs without a real prover node, because the e2e fixture uses L1 interval mining
   * and nothing marks blocks proven automatically. Without this, L1's `aztecProofSubmissionEpochs`
   * window expires mid-test and triggers a chain prune that drops in-flight wallet txs. Tests that
   * intentionally pause proving (e.g. inbox drift tests) can stop it via
   * `await t.epochTestSettler?.stop()`.
   */
  epochTestSettler?: EpochTestSettler;

  deployL1ContractsValues!: DeployAztecL1ContractsReturnType;

  constructor(
    testName: string,
    opts: SetupOptions = {},
    deployL1ContractsArgs: Partial<DeployAztecL1ContractsArgs> = {},
    pxeOpts: Partial<PXEConfig> = {},
    l1HarnessAccountIndex?: number,
  ) {
    super();
    this.testName = testName;
    this.logger = createLogger(`e2e:e2e_cross_chain_messaging:${testName}`);
    this.setupOptions = opts;
    this.deployL1ContractsArgs = {
      initialValidators: [],
      ...deployL1ContractsArgs,
    };
    this.pxeOpts = pxeOpts;
    this.l1HarnessAccountIndex = l1HarnessAccountIndex;
    this.requireEpochProven = opts.startProverNode ?? false;
  }

  override async setup(opts: SingleNodeTestOpts = {}, pxeOpts: Partial<PXEConfig> = {}) {
    this.logger.info('Setting up cross chain messaging test');
    // Recompute requireEpochProven from the merged options so per-call startProverNode is honored.
    this.requireEpochProven = opts.startProverNode ?? this.setupOptions.startProverNode ?? false;
    const context = await setup(
      3,
      {
        ...this.setupOptions,
        ...opts,
        fundSponsoredFPC: true,
        l1ContractsArgs: { ...this.deployL1ContractsArgs, ...opts.l1ContractsArgs },
        // `advanceToEpochProven` warps anvil's L1 clock forward by up to a full epoch in one
        // step. The prover-node tracks L1 time via `dateProvider.setTime(...)`, so any
        // in-flight tx-gather sees its deadline jump into the past and short-circuits. Use
        // a generous gather window so the deadline survives the warp.
        proverNodeConfig: {
          ...this.setupOptions.proverNodeConfig,
          ...opts.proverNodeConfig,
          txGatheringTimeoutMs: opts.proverNodeConfig?.txGatheringTimeoutMs ?? 10 * 60 * 1000,
        },
      },
      { ...this.pxeOpts, ...pxeOpts },
    );

    // Reuse the base context machinery (rollup, epoch cache, chain monitor, node tracking, teardown)
    // over the environment built above. Restore the CrossChainMessagingTest-named logger afterwards,
    // since hydrateFromContext repoints `this.logger` at the context logger.
    await this.hydrateFromContext(context);
    this.logger = createLogger(`e2e:e2e_cross_chain_messaging:${this.testName}`);

    await this.applyBaseSetup();
  }

  async advanceToEpochProven(l2TxReceipt: TxReceipt): Promise<EpochNumber> {
    const block = await this.aztecNode.getBlock(l2TxReceipt.blockNumber!);
    const cp = await retryUntil(
      async () => (await this.aztecNode.getCheckpoints(block!.checkpointNumber, 1))[0],
      `archiver indexes checkpoint ${block!.checkpointNumber}`,
      120,
      0.5,
    );
    const epochDuration = await this.rollup.getEpochDuration();
    const epoch = getEpochAtSlot(cp.header.slotNumber, { epochDuration });
    // Warp to the next epoch.
    await this.cheatCodes.rollup.advanceToEpoch(EpochNumber(epoch + 1));
    // Wait for the tx to be proven.
    await waitForProven(this.aztecNode, l2TxReceipt, { provenTimeout: 300 });
    // Return the epoch the tx is in.
    return epoch;
  }

  async catchUpProvenChain() {
    const bn = await this.aztecNode.getBlockNumber();
    while ((await this.aztecNode.getBlockNumber('proven')) < bn) {
      await sleep(1000);
    }
  }

  override async teardown() {
    await this.epochTestSettler?.stop();
    await super.teardown();
  }

  async applyBaseSetup() {
    // Set up base context fields
    this.aztecNode = this.context.aztecNodeService;
    this.wallet = this.context.wallet;
    this.aztecNodeConfig = this.context.config;
    this.cheatCodes = this.context.cheatCodes;
    this.deployL1ContractsValues = this.context.deployL1ContractsValues;
    this.aztecNodeAdmin = this.context.aztecNodeService;

    if (!this.requireEpochProven) {
      // When no real prover is running, the L1 proof window (aztecProofSubmissionEpochs) would
      // otherwise expire mid-test and trigger a chain prune. The e2e fixture runs L1 on interval
      // mining and nothing marks blocks proven automatically, so start an EpochTestSettler to mark
      // each completed epoch as proven on L1.
      this.epochTestSettler = new EpochTestSettler(
        this.context.ethCheatCodes,
        this.context.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
        this.context.aztecNodeService.getBlockSource(),
        this.logger.createChild('epoch-settler'),
        { pollingIntervalMs: 500 },
      );
      await this.epochTestSettler.start();
    }

    [this.ownerAddress, this.user1Address, this.user2Address] = this.context.accounts;

    // Set up cross chain messaging
    this.logger.info('Applying e2e_cross_chain_messaging setup');

    await ensureAuthRegistryPublished(this.wallet, this.ownerAddress);

    const harnessL1Client = createExtendedL1Client(
      this.aztecNodeConfig.l1RpcUrls,
      MNEMONIC,
      undefined,
      undefined,
      this.l1HarnessAccountIndex,
    );

    const underlyingERC20Address = await deployL1Contract(harnessL1Client, TestERC20Abi, TestERC20Bytecode, [
      'Underlying',
      'UND',
      harnessL1Client.account.address,
    ]).then(({ address }) => address);

    this.logger.verbose(`Setting up cross chain harness...`);
    this.crossChainTestHarness = await CrossChainTestHarness.new(
      this.aztecNode,
      harnessL1Client,
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

    const l1Contracts = pickL1ContractAddresses(this.aztecNodeConfig);
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
      harnessL1Client,
      pickL1ContractAddresses(this.aztecNodeConfig),
      this.wallet,
      this.ownerAddress,
    );
  }
}
