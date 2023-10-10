import {
  AztecAddress,
  DebugLogger,
  EthAddress,
  Fr,
  NotePreimage,
  PXE,
  TxHash,
  TxStatus,
  Wallet,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { sha256ToField } from '@aztec/foundation/crypto';
import {
  OutboxAbi,
  PortalERC20Abi,
  PortalERC20Bytecode,
  TokenPortalAbi,
  TokenPortalBytecode,
} from '@aztec/l1-artifacts';
import { TokenBridgeContract, TokenContract } from '@aztec/noir-contracts/types';

import type { Abi, Narrow } from 'abitype';
import { Account, Chain, Hex, HttpTransport, PublicClient, WalletClient, getContract } from 'viem';

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
  walletClient: WalletClient<HttpTransport, Chain, Account>,
  publicClient: PublicClient<HttpTransport, Chain>,
  rollupRegistryAddress: EthAddress,
  owner: AztecAddress,
  underlyingERC20Address?: EthAddress,
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
  if (!underlyingERC20Address) {
    underlyingERC20Address = await deployL1Contract(walletClient, publicClient, PortalERC20Abi, PortalERC20Bytecode);
  }
  const underlyingERC20 = getContract({
    address: underlyingERC20Address.toString(),
    abi: PortalERC20Abi,
    walletClient,
    publicClient,
  });

  // deploy the token portal
  const tokenPortalAddress = await deployL1Contract(walletClient, publicClient, TokenPortalAbi, TokenPortalBytecode);
  const tokenPortal = getContract({
    address: tokenPortalAddress.toString(),
    abi: TokenPortalAbi,
    walletClient,
    publicClient,
  });

  // deploy l2 token
  const deployTx = TokenContract.deploy(wallet, owner).send();

  // now wait for the deploy txs to be mined. This way we send all tx in the same rollup.
  const deployReceipt = await deployTx.wait();
  if (deployReceipt.status !== TxStatus.MINED) throw new Error(`Deploy token tx status is ${deployReceipt.status}`);
  const token = await TokenContract.at(deployReceipt.contractAddress!, wallet);

  // deploy l2 token bridge and attach to the portal
  const bridge = await TokenBridgeContract.deploy(wallet, token.address)
    .send({ portalContract: tokenPortalAddress })
    .deployed();
  const bridgeAddress = bridge.address.toString();

  // now we wait for the txs to be mined. This way we send all tx in the same rollup.
  if ((await token.methods.admin().view()) !== owner.toBigInt()) throw new Error(`Token admin is not ${owner}`);

  if ((await bridge.methods.token().view()) !== token.address.toBigInt())
    throw new Error(`Bridge token is not ${token.address}`);

  // make the bridge a minter on the token:
  const makeMinterTx = token.methods.set_minter(bridge.address, true).send();
  const makeMinterReceipt = await makeMinterTx.wait();
  if (makeMinterReceipt.status !== TxStatus.MINED)
    throw new Error(`Make bridge a minter tx status is ${makeMinterReceipt.status}`);
  if ((await token.methods.is_minter(bridge.address).view()) === 1n) throw new Error(`Bridge is not a minter`);

  // initialize portal
  await tokenPortal.write.initialize(
    [rollupRegistryAddress.toString(), underlyingERC20Address.toString(), bridgeAddress],
    {} as any,
  );

  return { token, bridge, tokenPortalAddress, tokenPortal, underlyingERC20 };
}

/**
 * Helper function to deploy ETH contracts.
 * @param walletClient - A viem WalletClient.
 * @param publicClient - A viem PublicClient.
 * @param abi - The ETH contract's ABI (as abitype's Abi).
 * @param bytecode  - The ETH contract's bytecode.
 * @param args - Constructor arguments for the contract.
 * @returns The ETH address the contract was deployed to.
 */
export async function deployL1Contract(
  walletClient: WalletClient<HttpTransport, Chain, Account>,
  publicClient: PublicClient<HttpTransport, Chain>,
  abi: Narrow<Abi | readonly unknown[]>,
  bytecode: Hex,
  args: readonly unknown[] = [],
): Promise<EthAddress> {
  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args,
  } as any);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const contractAddress = receipt.contractAddress;
  if (!contractAddress) {
    throw new Error(`No contract address found in receipt: ${JSON.stringify(receipt)}`);
  }

  return EthAddress.fromString(receipt.contractAddress!);
}

/**
 * A Class for testing cross chain interactions, contains common interactions
 * shared between cross chain tests.
 */
export class CrossChainTestHarness {
  static async new(
    pxeService: PXE,
    publicClient: PublicClient<HttpTransport, Chain>,
    walletClient: any,
    wallet: Wallet,
    logger: DebugLogger,
    underlyingERC20Address?: EthAddress,
  ): Promise<CrossChainTestHarness> {
    const ethAccount = EthAddress.fromString((await walletClient.getAddresses())[0]);
    const owner = wallet.getCompleteAddress();
    const l1ContractAddresses = (await pxeService.getNodeInfo()).l1ContractAddresses;

    const outbox = getContract({
      address: l1ContractAddresses.outboxAddress!.toString(),
      abi: OutboxAbi,
      publicClient,
    });

    // Deploy and initialize all required contracts
    logger('Deploying and initializing token, portal and its bridge...');
    const { token, bridge, tokenPortalAddress, tokenPortal, underlyingERC20 } =
      await deployAndInitializeTokenAndBridgeContracts(
        wallet,
        walletClient,
        publicClient,
        l1ContractAddresses.registryAddress,
        owner.address,
        underlyingERC20Address,
      );
    logger('Deployed and initialized token, portal and its bridge.');

    return new CrossChainTestHarness(
      pxeService,
      logger,
      token,
      bridge,
      ethAccount,
      tokenPortalAddress,
      tokenPortal,
      underlyingERC20,
      outbox,
      publicClient,
      walletClient,
      owner.address,
    );
  }

  constructor(
    /** Private eXecution Environment (PXE). */
    public pxeService: PXE,
    /** Logger. */
    public logger: DebugLogger,

    /** L2 Token contract. */
    public l2Token: TokenContract,
    /** L2 Token bridge contract. */
    public l2Bridge: TokenBridgeContract,

    /** Eth account to interact with. */
    public ethAccount: EthAddress,

    /** Portal address. */
    public tokenPortalAddress: EthAddress,
    /** Token portal instance. */
    public tokenPortal: any,
    /** Underlying token for portal tests. */
    public underlyingERC20: any,
    /** Message Bridge Outbox. */
    public outbox: any,
    /** Viem Public client instance. */
    public publicClient: PublicClient<HttpTransport, Chain>,
    /** Viem Wallet Client instance. */
    public walletClient: any,

    /** Aztec address to use in tests. */
    public ownerAddress: AztecAddress,
  ) {}

  async generateClaimSecret(): Promise<[Fr, Fr]> {
    this.logger("Generating a claim secret using pedersen's hash function");
    const secret = Fr.random();
    const secretHash = await computeMessageSecretHash(secret);
    this.logger('Generated claim secret: ' + secretHash.toString(true));
    return [secret, secretHash];
  }

  async mintTokensOnL1(amount: bigint) {
    this.logger('Minting tokens on L1');
    await this.underlyingERC20.write.mint([this.ethAccount.toString(), amount], {} as any);
    expect(await this.underlyingERC20.read.balanceOf([this.ethAccount.toString()])).toBe(amount);
  }

  async getL1BalanceOf(address: EthAddress) {
    return await this.underlyingERC20.read.balanceOf([address.toString()]);
  }

  async sendTokensToPortalPublic(bridgeAmount: bigint, secretHash: Fr) {
    await this.underlyingERC20.write.approve([this.tokenPortalAddress.toString(), bridgeAmount], {} as any);

    // Deposit tokens to the TokenPortal
    const deadline = 2 ** 32 - 1; // max uint32 - 1

    this.logger('Sending messages to L1 portal to be consumed publicly');
    const args = [
      bridgeAmount,
      this.ownerAddress.toString(),
      this.ethAccount.toString(),
      deadline,
      secretHash.toString(true),
    ] as const;
    const { result: messageKeyHex } = await this.tokenPortal.simulate.depositToAztecPublic(args, {
      account: this.ethAccount.toString(),
    } as any);
    await this.tokenPortal.write.depositToAztecPublic(args, {} as any);

    return Fr.fromString(messageKeyHex);
  }

  async sendTokensToPortalPrivate(
    bridgeAmount: bigint,
    secretHashForL2MessageConsumption: Fr,
    secretHashForRedeemingMintedNotes: Fr,
  ) {
    await this.underlyingERC20.write.approve([this.tokenPortalAddress.toString(), bridgeAmount], {} as any);

    // Deposit tokens to the TokenPortal
    const deadline = 2 ** 32 - 1; // max uint32 - 1

    this.logger('Sending messages to L1 portal to be consumed privately');
    const args = [
      bridgeAmount,
      secretHashForRedeemingMintedNotes.toString(true),
      this.ethAccount.toString(),
      deadline,
      secretHashForL2MessageConsumption.toString(true),
    ] as const;
    const { result: messageKeyHex } = await this.tokenPortal.simulate.depositToAztecPrivate(args, {
      account: this.ethAccount.toString(),
    } as any);
    await this.tokenPortal.write.depositToAztecPrivate(args, {} as any);

    return Fr.fromString(messageKeyHex);
  }

  async mintTokensPublicOnL2(amount: bigint) {
    this.logger('Minting tokens on L2 publicly');
    const tx = this.l2Token.methods.mint_public(this.ownerAddress, amount).send();
    const receipt = await tx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);
  }

  async mintTokensPrivateOnL2(amount: bigint, secretHash: Fr) {
    const tx = this.l2Token.methods.mint_private(amount, secretHash).send();
    const receipt = await tx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);
    await this.addPendingShieldNoteToPXE(amount, secretHash, receipt.txHash);
  }

  async performL2Transfer(transferAmount: bigint, receiverAddress: AztecAddress) {
    // send a transfer tx to force through rollup with the message included
    const transferTx = this.l2Token.methods
      .transfer_public(this.ownerAddress, receiverAddress, transferAmount, 0)
      .send();
    const receipt = await transferTx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);
  }

  async consumeMessageOnAztecAndMintSecretly(
    bridgeAmount: bigint,
    secretHashForRedeemingMintedNotes: Fr,
    messageKey: Fr,
    secretForL2MessageConsumption: Fr,
  ) {
    this.logger('Consuming messages on L2 secretively');
    // Call the mint tokens function on the Aztec.nr contract
    const consumptionTx = this.l2Bridge.methods
      .claim_private(
        bridgeAmount,
        secretHashForRedeemingMintedNotes,
        this.ethAccount,
        messageKey,
        secretForL2MessageConsumption,
      )
      .send();
    const consumptionReceipt = await consumptionTx.wait();
    expect(consumptionReceipt.status).toBe(TxStatus.MINED);

    await this.addPendingShieldNoteToPXE(bridgeAmount, secretHashForRedeemingMintedNotes, consumptionReceipt.txHash);
  }

  async consumeMessageOnAztecAndMintPublicly(bridgeAmount: bigint, messageKey: Fr, secret: Fr) {
    this.logger('Consuming messages on L2 Publicly');
    // Call the mint tokens function on the Aztec.nr contract
    const tx = this.l2Bridge.methods
      .claim_public(this.ownerAddress, bridgeAmount, this.ethAccount, messageKey, secret)
      .send();
    const receipt = await tx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);
  }

  async withdrawPrivateFromAztecToL1(withdrawAmount: bigint, nonce: Fr = Fr.ZERO) {
    const withdrawTx = this.l2Bridge.methods
      .exit_to_l1_private(this.ethAccount, this.l2Token.address, withdrawAmount, EthAddress.ZERO, nonce)
      .send();
    const withdrawReceipt = await withdrawTx.wait();
    expect(withdrawReceipt.status).toBe(TxStatus.MINED);
  }

  async withdrawPublicFromAztecToL1(withdrawAmount: bigint, nonce: Fr = Fr.ZERO) {
    const withdrawTx = this.l2Bridge.methods
      .exit_to_l1_public(this.ethAccount, withdrawAmount, EthAddress.ZERO, nonce)
      .send();
    const withdrawReceipt = await withdrawTx.wait();
    expect(withdrawReceipt.status).toBe(TxStatus.MINED);
  }

  async getL2PrivateBalanceOf(owner: AztecAddress) {
    return await this.l2Token.methods.balance_of_private(owner).view({ from: owner });
  }

  async expectPrivateBalanceOnL2(owner: AztecAddress, expectedBalance: bigint) {
    const balance = await this.getL2PrivateBalanceOf(owner);
    this.logger(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  }

  async getL2PublicBalanceOf(owner: AztecAddress) {
    return await this.l2Token.methods.balance_of_public(owner).view();
  }

  async expectPublicBalanceOnL2(owner: AztecAddress, expectedBalance: bigint) {
    const balance = await this.getL2PublicBalanceOf(owner);
    expect(balance).toBe(expectedBalance);
  }

  async checkEntryIsNotInOutbox(withdrawAmount: bigint, callerOnL1: EthAddress = EthAddress.ZERO): Promise<Fr> {
    this.logger('Ensure that the entry is not in outbox yet');
    // 0xb460af94, selector for "withdraw(uint256,address,address)"
    const content = sha256ToField(
      Buffer.concat([
        Buffer.from([0xb4, 0x60, 0xaf, 0x94]),
        new Fr(withdrawAmount).toBuffer(),
        this.ethAccount.toBuffer32(),
        callerOnL1.toBuffer32(),
      ]),
    );
    const entryKey = sha256ToField(
      Buffer.concat([
        this.l2Bridge.address.toBuffer(),
        new Fr(1).toBuffer(), // aztec version
        this.tokenPortalAddress.toBuffer32() ?? Buffer.alloc(32, 0),
        new Fr(this.publicClient.chain.id).toBuffer(), // chain id
        content.toBuffer(),
      ]),
    );
    expect(await this.outbox.read.contains([entryKey.toString(true)])).toBeFalsy();

    return entryKey;
  }

  async withdrawFundsFromBridgeOnL1(withdrawAmount: bigint, entryKey: Fr) {
    this.logger('Send L1 tx to consume entry and withdraw funds');
    // Call function on L1 contract to consume the message
    const { request: withdrawRequest, result: withdrawEntryKey } = await this.tokenPortal.simulate.withdraw([
      withdrawAmount,
      this.ethAccount.toString(),
      false,
    ]);

    expect(withdrawEntryKey).toBe(entryKey.toString(true));
    expect(await this.outbox.read.contains([withdrawEntryKey])).toBeTruthy();

    await this.walletClient.writeContract(withdrawRequest);
    return withdrawEntryKey;
  }

  async shieldFundsOnL2(shieldAmount: bigint, secretHash: Fr) {
    this.logger('Shielding funds on L2');
    const shieldTx = this.l2Token.methods.shield(this.ownerAddress, shieldAmount, secretHash, 0).send();
    const shieldReceipt = await shieldTx.wait();
    expect(shieldReceipt.status).toBe(TxStatus.MINED);

    await this.addPendingShieldNoteToPXE(shieldAmount, secretHash, shieldReceipt.txHash);
  }

  async addPendingShieldNoteToPXE(shieldAmount: bigint, secretHash: Fr, txHash: TxHash) {
    this.logger('Adding note to PXE');
    const storageSlot = new Fr(5);
    const preimage = new NotePreimage([new Fr(shieldAmount), secretHash]);
    await this.pxeService.addNote(this.ownerAddress, this.l2Token.address, storageSlot, preimage, txHash);
  }

  async redeemShieldPrivatelyOnL2(shieldAmount: bigint, secret: Fr) {
    this.logger('Spending commitment in private call');
    const privateTx = this.l2Token.methods.redeem_shield(this.ownerAddress, shieldAmount, secret).send();
    const privateReceipt = await privateTx.wait();
    expect(privateReceipt.status).toBe(TxStatus.MINED);
  }

  async unshieldTokensOnL2(unshieldAmount: bigint, nonce = Fr.ZERO) {
    this.logger('Unshielding tokens');
    const unshieldTx = this.l2Token.methods
      .unshield(this.ownerAddress, this.ownerAddress, unshieldAmount, nonce)
      .send();
    const unshieldReceipt = await unshieldTx.wait();
    expect(unshieldReceipt.status).toBe(TxStatus.MINED);
  }
}
