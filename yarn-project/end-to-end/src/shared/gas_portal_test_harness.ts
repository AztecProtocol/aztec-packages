import {
  type AztecAddress,
  type AztecNode,
  type DebugLogger,
  EthAddress,
  L1FeeJuicePortalManager,
  type L1TokenManager,
  type L2AmountClaim,
  type PXE,
  type Wallet,
} from '@aztec/aztec.js';
import { FeeJuicePortalAbi, OutboxAbi, TestERC20Abi } from '@aztec/l1-artifacts';
import { FeeJuiceContract } from '@aztec/noir-contracts.js';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import {
  type Account,
  type Chain,
  type GetContractReturnType,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  getContract,
} from 'viem';

export interface IGasBridgingTestHarness {
  getL1FeeJuiceBalance(address: EthAddress): Promise<bigint>;
  prepareTokensOnL1(bridgeAmount: bigint, owner: AztecAddress): Promise<L2AmountClaim>;
  bridgeFromL1ToL2(bridgeAmount: bigint, owner: AztecAddress): Promise<void>;
  feeJuice: FeeJuiceContract;
  l1FeeJuiceAddress: EthAddress;
}

export interface FeeJuicePortalTestingHarnessFactoryConfig {
  aztecNode: AztecNode;
  pxeService: PXE;
  publicClient: PublicClient<HttpTransport, Chain>;
  walletClient: WalletClient<HttpTransport, Chain, Account>;
  wallet: Wallet;
  logger: DebugLogger;
  mockL1?: boolean;
}

export class FeeJuicePortalTestingHarnessFactory {
  private constructor(private config: FeeJuicePortalTestingHarnessFactoryConfig) {}

  private async createReal() {
    const { aztecNode, pxeService, publicClient, walletClient, wallet, logger } = this.config;

    const ethAccount = EthAddress.fromString((await walletClient.getAddresses())[0]);
    const l1ContractAddresses = (await pxeService.getNodeInfo()).l1ContractAddresses;

    const feeJuiceAddress = l1ContractAddresses.feeJuiceAddress;
    const feeJuicePortalAddress = l1ContractAddresses.feeJuicePortalAddress;

    if (feeJuiceAddress.isZero() || feeJuicePortalAddress.isZero()) {
      throw new Error('Fee Juice portal not deployed on L1');
    }

    const outbox = getContract({
      address: l1ContractAddresses.outboxAddress.toString(),
      abi: OutboxAbi,
      client: walletClient,
    });

    const gasL1 = getContract({
      address: feeJuiceAddress.toString(),
      abi: TestERC20Abi,
      client: walletClient,
    });

    const feeJuicePortal = getContract({
      address: feeJuicePortalAddress.toString(),
      abi: FeeJuicePortalAbi,
      client: walletClient,
    });

    const gasL2 = await FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, wallet);

    return new GasBridgingTestHarness(
      aztecNode,
      pxeService,
      logger,
      gasL2,
      ethAccount,
      feeJuicePortalAddress,
      feeJuicePortal,
      gasL1,
      outbox,
      publicClient,
      walletClient,
    );
  }

  static create(config: FeeJuicePortalTestingHarnessFactoryConfig): Promise<GasBridgingTestHarness> {
    const factory = new FeeJuicePortalTestingHarnessFactory(config);
    return factory.createReal();
  }
}

/**
 * A Class for testing cross chain interactions, contains common interactions
 * shared between cross chain tests.
 */
export class GasBridgingTestHarness implements IGasBridgingTestHarness {
  private readonly l1TokenManager: L1TokenManager;
  private readonly feeJuicePortalManager: L1FeeJuicePortalManager;

  constructor(
    /** Aztec node */
    public aztecNode: AztecNode,
    /** Private eXecution Environment (PXE). */
    public pxeService: PXE,
    /** Logger. */
    public logger: DebugLogger,

    /** L2 Token/Bridge contract. */
    public feeJuice: FeeJuiceContract,

    /** Eth account to interact with. */
    public ethAccount: EthAddress,

    /** Portal address. */
    public tokenPortalAddress: EthAddress,
    /** Token portal instance. */
    public tokenPortal: GetContractReturnType<typeof FeeJuicePortalAbi, WalletClient<HttpTransport, Chain, Account>>,
    /** Underlying token for portal tests. */
    public underlyingERC20: GetContractReturnType<typeof TestERC20Abi, WalletClient<HttpTransport, Chain, Account>>,
    /** Message Bridge Outbox. */
    public outbox: GetContractReturnType<typeof OutboxAbi, PublicClient<HttpTransport, Chain>>,
    /** Viem Public client instance. */
    public publicClient: PublicClient<HttpTransport, Chain>,
    /** Viem Wallet Client instance. */
    public walletClient: WalletClient<HttpTransport, Chain, Account>,
  ) {
    this.feeJuicePortalManager = new L1FeeJuicePortalManager(
      EthAddress.fromString(this.tokenPortal.address),
      EthAddress.fromString(this.underlyingERC20.address),
      this.publicClient,
      this.walletClient,
      this.logger,
    );

    this.l1TokenManager = this.feeJuicePortalManager.getTokenManager();
  }

  get l1FeeJuiceAddress() {
    return EthAddress.fromString(this.underlyingERC20.address);
  }

  async mintTokensOnL1(amount: bigint, to: EthAddress = this.ethAccount) {
    const balanceBefore = await this.underlyingERC20.read.balanceOf([to.toString()]);
    await this.l1TokenManager.mint(amount, to.toString());
    expect(await this.underlyingERC20.read.balanceOf([to.toString()])).toBe(balanceBefore + amount);
  }

  async getL1FeeJuiceBalance(address: EthAddress) {
    return await this.l1TokenManager.getL1TokenBalance(address.toString());
  }

  sendTokensToPortalPublic(bridgeAmount: bigint, l2Address: AztecAddress, mint = false) {
    return this.feeJuicePortalManager.bridgeTokensPublic(l2Address, bridgeAmount, mint);
  }

  async consumeMessageOnAztecAndClaimPrivately(owner: AztecAddress, claim: L2AmountClaim) {
    this.logger.info('Consuming messages on L2 Privately');
    const { claimAmount, claimSecret, messageLeafIndex } = claim;
    await this.feeJuice.methods.claim(owner, claimAmount, claimSecret, messageLeafIndex).send().wait();
  }

  async getL2PublicBalanceOf(owner: AztecAddress) {
    return await this.feeJuice.methods.balance_of_public(owner).simulate();
  }

  async expectPublicBalanceOnL2(owner: AztecAddress, expectedBalance: bigint) {
    const balance = await this.getL2PublicBalanceOf(owner);
    expect(balance).toBe(expectedBalance);
  }

  async prepareTokensOnL1(bridgeAmount: bigint, owner: AztecAddress) {
    const claim = await this.sendTokensToPortalPublic(bridgeAmount, owner, true);

    // Perform an unrelated transactions on L2 to progress the rollup by 2 blocks.
    await this.feeJuice.methods.check_balance(0).send().wait();
    await this.feeJuice.methods.check_balance(0).send().wait();

    return claim;
  }

  async bridgeFromL1ToL2(bridgeAmount: bigint, owner: AztecAddress) {
    // Prepare the tokens on the L1 side
    const claim = await this.prepareTokensOnL1(bridgeAmount, owner);

    // Consume L1 -> L2 message and claim tokens privately on L2
    await this.consumeMessageOnAztecAndClaimPrivately(owner, claim);
    await this.expectPublicBalanceOnL2(owner, bridgeAmount);
  }
}
// docs:end:cross_chain_test_harness
