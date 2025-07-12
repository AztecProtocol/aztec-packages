// docs:start:cross_chain_test_harness
import {
  type AccountWallet,
  AuthWitness,
  type AztecAddress,
  type AztecNode,
  EthAddress,
  type FieldsOf,
  Fr,
  type L1TokenManager,
  L1TokenPortalManager,
  type L2AmountClaim,
  type L2AmountClaimWithRecipient,
  type Logger,
  type PXE,
  type SiblingPath,
  type TxReceipt,
  type Wallet,
  retryUntil,
} from '@aztec/aztec.js';
import { type ExtendedViemWalletClient, type L1ContractAddresses, deployL1Contract } from '@aztec/ethereum';
import { TestERC20Abi, TokenPortalAbi, TokenPortalBytecode } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBridgeContract } from '@aztec/noir-contracts.js/TokenBridge';

import { type Hex, getContract } from 'viem';

import { mintTokensToPrivate } from '../fixtures/token_utils.js';

// docs:start:deployAndInitializeTokenAndBridgeContracts
/**
 * Deploy L1 token and portal, initialize portal, deploy a non native l2 token contract, its L2 bridge contract and attach is to the portal.
 * @param wallet - the wallet instance
 * @param walletClient - A viem WalletClient.
 * @param publicClient - A viem PublicClient.
 * @param rollupRegistryAddress - address of rollup registry to pass to initialize the token portal
 * @param owner - owner of the L2 contract
 * @param underlyingERC20Address - address of the underlying ERC20 contract to use (if none supplied, it deploys one)
 * @returns l2 contract instance, bridge contract instance, token portal instance, token portal address and the underlying ERC20 instance
 */
export async function deployAndInitializeTokenAndBridgeContracts(
  wallet: Wallet,
  l1Client: ExtendedViemWalletClient,
  rollupRegistryAddress: EthAddress,
  owner: AztecAddress,
  underlyingERC20Address: EthAddress,
): Promise<{
  /**
   * The L2 token contract instance.
   */
  token: TokenContract;
  /**
   * The L2 bridge contract instance.
   */
  bridge: TokenBridgeContract;
  /**
   * The token portal contract address.
   */
  tokenPortalAddress: EthAddress;
  /**
   * The token portal contract instance
   */
  tokenPortal: any;
  /**
   * The underlying ERC20 contract instance.
   */
  underlyingERC20: any;
}> {
  // deploy the token portal
  const { address: tokenPortalAddress } = await deployL1Contract(l1Client, TokenPortalAbi, TokenPortalBytecode);
  const tokenPortal = getContract({
    address: tokenPortalAddress.toString(),
    abi: TokenPortalAbi,
    client: l1Client,
  });

  // deploy l2 token
  const token = await TokenContract.deploy(wallet, owner, 'TokenName', 'TokenSymbol', 18).send().deployed();

  // deploy l2 token bridge and attach to the portal
  const bridge = await TokenBridgeContract.deploy(wallet, token.address, tokenPortalAddress).send().deployed();

  if ((await token.methods.get_admin().simulate()) !== owner.toBigInt()) {
    throw new Error(`Token admin is not ${owner}`);
  }

  if (!(await bridge.methods.get_config().simulate()).token.equals(token.address)) {
    throw new Error(`Bridge token is not ${token.address}`);
  }

  // make the bridge a minter on the token:
  await token.methods.set_minter(bridge.address, true).send().wait();
  if ((await token.methods.is_minter(bridge.address).simulate()) === 1n) {
    throw new Error(`Bridge is not a minter`);
  }

  // initialize portal
  await tokenPortal.write.initialize(
    [rollupRegistryAddress.toString(), underlyingERC20Address!.toString(), bridge.address.toString()],
    {} as any,
  );

  const underlyingERC20 = getContract({
    address: underlyingERC20Address.toString(),
    abi: TestERC20Abi,
    client: l1Client,
  });

  return { token, bridge, tokenPortalAddress, tokenPortal, underlyingERC20 };
}
// docs:end:deployAndInitializeTokenAndBridgeContracts

export type CrossChainContext = {
  l2Token: AztecAddress;
  l2Bridge: AztecAddress;
  tokenPortal: EthAddress;
  underlying: EthAddress;
  ethAccount: EthAddress;
  ownerAddress: AztecAddress;
  inbox: EthAddress;
  outbox: EthAddress;
};

/**
 * A Class for testing cross chain interactions, contains common interactions
 * shared between cross chain tests.
 */
export class CrossChainTestHarness {
  static async new(
    aztecNode: AztecNode,
    pxeService: PXE,
    l1Client: ExtendedViemWalletClient,
    wallet: AccountWallet,
    logger: Logger,
    underlyingERC20Address: EthAddress,
  ): Promise<CrossChainTestHarness> {
    const ethAccount = EthAddress.fromString((await l1Client.getAddresses())[0]);
    const l1ContractAddresses = (await pxeService.getNodeInfo()).l1ContractAddresses;

    // Deploy and initialize all required contracts
    logger.info('Deploying and initializing token, portal and its bridge...');
    const { token, bridge, tokenPortalAddress, underlyingERC20 } = await deployAndInitializeTokenAndBridgeContracts(
      wallet,
      l1Client,
      l1ContractAddresses.registryAddress,
      wallet.getAddress(),
      underlyingERC20Address,
    );
    logger.info('Deployed and initialized token, portal and its bridge.');

    return new CrossChainTestHarness(
      aztecNode,
      pxeService,
      logger,
      token,
      bridge,
      ethAccount,
      tokenPortalAddress,
      underlyingERC20.address,
      l1Client,
      l1ContractAddresses,
      wallet,
    );
  }

  private readonly l1TokenManager: L1TokenManager;
  private readonly l1TokenPortalManager: L1TokenPortalManager;

  public readonly ownerAddress: AztecAddress;

  constructor(
    /** Aztec node instance. */
    public aztecNode: AztecNode,
    /** Private eXecution Environment (PXE). */
    public pxeService: PXE,
    /** Logger. */
    public logger: Logger,

    /** L2 Token contract. */
    public l2Token: TokenContract,
    /** L2 Token bridge contract. */
    public l2Bridge: TokenBridgeContract,

    /** Eth account to interact with. */
    public ethAccount: EthAddress,

    /** Portal address. */
    public tokenPortalAddress: EthAddress,
    /** Underlying token for portal tests. */
    public underlyingERC20Address: EthAddress,
    /** Viem Extended client instance. */
    public l1Client: ExtendedViemWalletClient,

    /** Deployment addresses for all L1 contracts */
    public readonly l1ContractAddresses: L1ContractAddresses,

    /** Wallet of the owner. */
    public readonly ownerWallet: AccountWallet,
  ) {
    this.l1TokenPortalManager = new L1TokenPortalManager(
      this.tokenPortalAddress,
      this.underlyingERC20Address,
      this.l1ContractAddresses.outboxAddress,
      this.l1Client,
      this.logger,
    );
    this.l1TokenManager = this.l1TokenPortalManager.getTokenManager();
    this.ownerAddress = this.ownerWallet.getAddress();
  }

  async mintTokensOnL1(amount: bigint) {
    const balanceBefore = await this.l1TokenManager.getL1TokenBalance(this.ethAccount.toString());
    await this.l1TokenManager.mint(amount, this.ethAccount.toString());
    expect(await this.l1TokenManager.getL1TokenBalance(this.ethAccount.toString())).toEqual(balanceBefore + amount);
  }

  getL1BalanceOf(address: EthAddress) {
    return this.l1TokenManager.getL1TokenBalance(address.toString());
  }

  sendTokensToPortalPublic(bridgeAmount: bigint, mint = false) {
    return this.l1TokenPortalManager.bridgeTokensPublic(this.ownerAddress, bridgeAmount, mint);
  }

  sendTokensToPortalPrivate(bridgeAmount: bigint, mint = false) {
    return this.l1TokenPortalManager.bridgeTokensPrivate(this.ownerAddress, bridgeAmount, mint);
  }

  async mintTokensPublicOnL2(amount: bigint) {
    this.logger.info('Minting tokens on L2 publicly');
    await this.l2Token.methods.mint_to_public(this.ownerAddress, amount).send().wait();
  }

  async mintTokensPrivateOnL2(amount: bigint) {
    await mintTokensToPrivate(this.l2Token, this.ownerWallet, this.ownerAddress, amount);
  }

  async sendL2PublicTransfer(transferAmount: bigint, receiverAddress: AztecAddress) {
    // send a transfer tx to force through rollup with the message included
    await this.l2Token.methods.transfer_in_public(this.ownerAddress, receiverAddress, transferAmount, 0).send().wait();
  }

  async consumeMessageOnAztecAndMintPrivately(
    claim: Pick<L2AmountClaimWithRecipient, 'claimAmount' | 'claimSecret' | 'messageLeafIndex' | 'recipient'>,
  ) {
    this.logger.info('Consuming messages on L2 privately');
    const { recipient, claimAmount, claimSecret: secretForL2MessageConsumption, messageLeafIndex } = claim;
    await this.l2Bridge.methods
      .claim_private(recipient, claimAmount, secretForL2MessageConsumption, messageLeafIndex)
      .send()
      .wait();
  }

  async consumeMessageOnAztecAndMintPublicly(
    claim: Pick<L2AmountClaim, 'claimAmount' | 'claimSecret' | 'messageLeafIndex'>,
  ) {
    this.logger.info('Consuming messages on L2 Publicly');
    const { claimAmount, claimSecret, messageLeafIndex } = claim;
    await this.l2Bridge.methods
      .claim_public(this.ownerAddress, claimAmount, claimSecret, messageLeafIndex)
      .send()
      .wait();
  }

  async withdrawPrivateFromAztecToL1(
    withdrawAmount: bigint,
    authwitNonce: Fr = Fr.ZERO,
    authWitness: AuthWitness,
  ): Promise<FieldsOf<TxReceipt>> {
    const withdrawReceipt = await this.l2Bridge.methods
      .exit_to_l1_private(this.l2Token.address, this.ethAccount, withdrawAmount, EthAddress.ZERO, authwitNonce)
      .send({ authWitnesses: [authWitness] })
      .wait();

    return withdrawReceipt;
  }

  async withdrawPublicFromAztecToL1(withdrawAmount: bigint, authwitNonce: Fr = Fr.ZERO): Promise<FieldsOf<TxReceipt>> {
    const withdrawReceipt = await this.l2Bridge.methods
      .exit_to_l1_public(this.ethAccount, withdrawAmount, EthAddress.ZERO, authwitNonce)
      .send()
      .wait();

    return withdrawReceipt;
  }

  async getL2PrivateBalanceOf(owner: AztecAddress) {
    return await this.l2Token.methods.balance_of_private(owner).simulate({ from: owner });
  }

  async expectPrivateBalanceOnL2(owner: AztecAddress, expectedBalance: bigint) {
    const balance = await this.getL2PrivateBalanceOf(owner);
    this.logger.info(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  }

  async getL2PublicBalanceOf(owner: AztecAddress) {
    return await this.l2Token.methods.balance_of_public(owner).simulate();
  }

  async expectPublicBalanceOnL2(owner: AztecAddress, expectedBalance: bigint) {
    const balance = await this.getL2PublicBalanceOf(owner);
    expect(balance).toBe(expectedBalance);
  }

  async getL2ToL1MessageLeaf(withdrawAmount: bigint, callerOnL1: EthAddress = EthAddress.ZERO): Promise<Fr> {
    return await this.l1TokenPortalManager.getL2ToL1MessageLeaf(
      withdrawAmount,
      this.ethAccount,
      this.l2Bridge.address,
      callerOnL1,
    );
  }

  withdrawFundsFromBridgeOnL1(
    amount: bigint,
    blockNumber: number | bigint,
    messageIndex: bigint,
    siblingPath: SiblingPath<number>,
  ) {
    return this.l1TokenPortalManager.withdrawFunds(
      amount,
      this.ethAccount,
      BigInt(blockNumber),
      messageIndex,
      siblingPath,
    );
  }

  async transferToPrivateOnL2(shieldAmount: bigint) {
    this.logger.info('Transferring to private on L2');
    await this.l2Token.methods.transfer_to_private(this.ownerAddress, shieldAmount).send().wait();
  }

  async transferToPublicOnL2(amount: bigint, authwitNonce = Fr.ZERO) {
    this.logger.info('Transferring tokens to public');
    await this.l2Token.methods
      .transfer_to_public(this.ownerAddress, this.ownerAddress, amount, authwitNonce)
      .send()
      .wait();
  }

  /**
   * Makes message available for consumption.
   * @dev Does that by performing 2 unrelated transactions on L2 to progress the rollup by 2 blocks and then waits for
   * message to be processed by archiver. We need to progress by 2 because there is a 1 block lag between when
   * the message is sent to Inbox and when the subtree containing the message is included in the block and then when
   * it's included it becomes available for consumption in the next block because the l1 to l2 message tree.
   */
  async makeMessageConsumable(msgHash: Fr | Hex) {
    const frMsgHash = typeof msgHash === 'string' ? Fr.fromHexString(msgHash) : msgHash;
    // We poll isL1ToL2MessageSynced endpoint until the message is available
    await retryUntil(async () => await this.aztecNode.isL1ToL2MessageSynced(frMsgHash), 'message sync', 10);

    await this.mintTokensPublicOnL2(0n);
    await this.mintTokensPublicOnL2(0n);
  }

  toCrossChainContext(): CrossChainContext {
    return {
      l2Token: this.l2Token.address,
      l2Bridge: this.l2Bridge.address,
      tokenPortal: this.tokenPortalAddress,
      underlying: this.underlyingERC20Address,
      ethAccount: this.ethAccount,
      ownerAddress: this.ownerAddress,
      inbox: this.l1ContractAddresses.inboxAddress,
      outbox: this.l1ContractAddresses.outboxAddress,
    };
  }
}
// docs:end:cross_chain_test_harness
