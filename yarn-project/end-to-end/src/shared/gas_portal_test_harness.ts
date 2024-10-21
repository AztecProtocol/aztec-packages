import {
  type AztecAddress,
  type AztecNode,
  type DebugLogger,
  EthAddress,
  Fr,
  type PXE,
  type Wallet,
  computeSecretHash,
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
  prepareTokensOnL1(
    l1TokenBalance: bigint,
    bridgeAmount: bigint,
    owner: AztecAddress,
  ): Promise<{ secret: Fr; secretHash: Fr; msgHash: Fr }>;
  bridgeFromL1ToL2(l1TokenBalance: bigint, bridgeAmount: bigint, owner: AztecAddress): Promise<void>;
  l2Token: FeeJuiceContract;
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
  constructor(
    /** Aztec node */
    public aztecNode: AztecNode,
    /** Private eXecution Environment (PXE). */
    public pxeService: PXE,
    /** Logger. */
    public logger: DebugLogger,

    /** L2 Token/Bridge contract. */
    public l2Token: FeeJuiceContract,

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
    public walletClient: WalletClient,
  ) {}

  get l1FeeJuiceAddress() {
    return EthAddress.fromString(this.underlyingERC20.address);
  }

  generateClaimSecret(): [Fr, Fr] {
    this.logger.debug("Generating a claim secret using pedersen's hash function");
    const secret = Fr.random();
    const secretHash = computeSecretHash(secret);
    this.logger.info('Generated claim secret: ' + secretHash.toString());
    return [secret, secretHash];
  }

  async mintTokensOnL1(amount: bigint, to: EthAddress = this.ethAccount) {
    this.logger.info('Minting tokens on L1');
    const balanceBefore = await this.underlyingERC20.read.balanceOf([to.toString()]);
    await this.publicClient.waitForTransactionReceipt({
      hash: await this.underlyingERC20.write.mint([to.toString(), amount]),
    });
    expect(await this.underlyingERC20.read.balanceOf([to.toString()])).toBe(balanceBefore + amount);
  }

  async getL1FeeJuiceBalance(address: EthAddress) {
    return await this.underlyingERC20.read.balanceOf([address.toString()]);
  }

  async sendTokensToPortalPublic(bridgeAmount: bigint, l2Address: AztecAddress, secretHash: Fr) {
    await this.publicClient.waitForTransactionReceipt({
      hash: await this.underlyingERC20.write.approve([this.tokenPortalAddress.toString(), bridgeAmount]),
    });

    // Deposit tokens to the TokenPortal
    this.logger.info('Sending messages to L1 portal to be consumed publicly');
    const args = [l2Address.toString(), bridgeAmount, secretHash.toString()] as const;
    const { result: messageHash } = await this.tokenPortal.simulate.depositToAztecPublic(args, {
      account: this.ethAccount.toString(),
    } as any);
    await this.publicClient.waitForTransactionReceipt({
      hash: await this.tokenPortal.write.depositToAztecPublic(args),
    });

    return Fr.fromString(messageHash);
  }

  async consumeMessageOnAztecAndClaimPrivately(bridgeAmount: bigint, owner: AztecAddress, secret: Fr) {
    this.logger.info('Consuming messages on L2 Privately');
    // Call the claim function on the Aztec.nr Fee Juice contract
    await this.l2Token.methods.claim(owner, bridgeAmount, secret).send().wait();
  }

  async getL2PublicBalanceOf(owner: AztecAddress) {
    return await this.l2Token.methods.balance_of_public(owner).simulate();
  }

  async expectPublicBalanceOnL2(owner: AztecAddress, expectedBalance: bigint) {
    const balance = await this.getL2PublicBalanceOf(owner);
    expect(balance).toBe(expectedBalance);
  }

  async prepareTokensOnL1(l1TokenBalance: bigint, bridgeAmount: bigint, owner: AztecAddress) {
    const [secret, secretHash] = this.generateClaimSecret();

    // Mint tokens on L1
    await this.mintTokensOnL1(l1TokenBalance);

    // Deposit tokens to the TokenPortal
    const msgHash = await this.sendTokensToPortalPublic(bridgeAmount, owner, secretHash);
    expect(await this.getL1FeeJuiceBalance(this.ethAccount)).toBe(l1TokenBalance - bridgeAmount);

    // Perform an unrelated transactions on L2 to progress the rollup by 2 blocks.
    await this.l2Token.methods.check_balance(0).send().wait();
    await this.l2Token.methods.check_balance(0).send().wait();

    return { secret, msgHash, secretHash };
  }

  async bridgeFromL1ToL2(l1TokenBalance: bigint, bridgeAmount: bigint, owner: AztecAddress) {
    // Prepare the tokens on the L1 side
    const { secret } = await this.prepareTokensOnL1(l1TokenBalance, bridgeAmount, owner);

    // Consume L1-> L2 message and claim tokens privately on L2
    await this.consumeMessageOnAztecAndClaimPrivately(bridgeAmount, owner, secret);
    await this.expectPublicBalanceOnL2(owner, bridgeAmount);
  }
}
// docs:end:cross_chain_test_harness
