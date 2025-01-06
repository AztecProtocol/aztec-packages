import {
  type AztecAddress,
  EthAddress,
  Fr,
  type Logger,
  type PXE,
  type SiblingPath,
  computeSecretHash,
} from '@aztec/aztec.js';
import { extractEvent } from '@aztec/ethereum';
import { sha256ToField } from '@aztec/foundation/crypto';
import { FeeJuicePortalAbi, OutboxAbi, TestERC20Abi, TokenPortalAbi } from '@aztec/l1-artifacts';

import {
  type Account,
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  getContract,
  toFunctionSelector,
} from 'viem';

/** L1 to L2 message info to claim it on L2. */
export type L2Claim = {
  /** Secret for claiming. */
  claimSecret: Fr;
  /** Hash of the secret for claiming. */
  claimSecretHash: Fr;
  /** Hash of the message. */
  messageHash: Hex;
  /** Leaf index in the L1 to L2 message tree. */
  messageLeafIndex: bigint;
};

/** L1 to L2 message info that corresponds to an amount to claim. */
export type L2AmountClaim = L2Claim & { /** Amount to claim */ claimAmount: Fr };

/** L1 to L2 message info that corresponds to an amount to claim with associated recipient. */
export type L2AmountClaimWithRecipient = L2AmountClaim & {
  /** Address that will receive the newly minted notes. */ recipient: AztecAddress;
};

/** Stringifies an eth address for logging. */
function stringifyEthAddress(address: EthAddress | Hex, name?: string) {
  return name ? `${name} (${address.toString()})` : address.toString();
}

/** Generates a pair secret and secret hash */
export function generateClaimSecret(logger?: Logger): [Fr, Fr] {
  const secret = Fr.random();
  const secretHash = computeSecretHash(secret);
  logger?.verbose(`Generated claim secret=${secret.toString()} hash=${secretHash.toString()}`);
  return [secret, secretHash];
}

/** Helper for managing an ERC20 on L1. */
export class L1TokenManager {
  private contract: GetContractReturnType<typeof TestERC20Abi, WalletClient<HttpTransport, Chain, Account>>;

  public constructor(
    /** Address of the ERC20 contract. */
    public readonly address: EthAddress,
    private publicClient: PublicClient<HttpTransport, Chain>,
    private walletClient: WalletClient<HttpTransport, Chain, Account>,
    private logger: Logger,
  ) {
    this.contract = getContract({
      address: this.address.toString(),
      abi: TestERC20Abi,
      client: this.walletClient,
    });
  }

  /**
   * Returns the balance of the given address.
   * @param address - Address to get the balance of.
   */
  public async getL1TokenBalance(address: Hex) {
    return await this.contract.read.balanceOf([address]);
  }

  /**
   * Mints tokens for the given address. Returns once the tx has been mined.
   * @param amount - Amount to mint.
   * @param address - Address to mint the tokens for.
   * @param addressName - Optional name of the address for logging.
   */
  public async mint(amount: bigint, address: Hex, addressName?: string) {
    this.logger.info(`Minting ${amount} tokens for ${stringifyEthAddress(address, addressName)}`);
    await this.publicClient.waitForTransactionReceipt({
      hash: await this.contract.write.mint([address, amount]),
    });
  }

  /**
   * Approves tokens for the given address. Returns once the tx has been mined.
   * @param amount - Amount to approve.
   * @param address - Address to approve the tokens for.
   * @param addressName - Optional name of the address for logging.
   */
  public async approve(amount: bigint, address: Hex, addressName = '') {
    this.logger.info(`Approving ${amount} tokens for ${stringifyEthAddress(address, addressName)}`);
    await this.publicClient.waitForTransactionReceipt({
      hash: await this.contract.write.approve([address, amount]),
    });
  }
}

/** Helper for interacting with the FeeJuicePortal on L1. */
export class L1FeeJuicePortalManager {
  private readonly tokenManager: L1TokenManager;
  private readonly contract: GetContractReturnType<
    typeof FeeJuicePortalAbi,
    WalletClient<HttpTransport, Chain, Account>
  >;

  constructor(
    portalAddress: EthAddress,
    tokenAddress: EthAddress,
    private readonly publicClient: PublicClient<HttpTransport, Chain>,
    private readonly walletClient: WalletClient<HttpTransport, Chain, Account>,
    private readonly logger: Logger,
  ) {
    this.tokenManager = new L1TokenManager(tokenAddress, publicClient, walletClient, logger);
    this.contract = getContract({
      address: portalAddress.toString(),
      abi: FeeJuicePortalAbi,
      client: this.walletClient,
    });
  }

  /** Returns the associated token manager for the L1 ERC20. */
  public getTokenManager() {
    return this.tokenManager;
  }

  /**
   * Bridges fee juice from L1 to L2 publicly. Handles L1 ERC20 approvals. Returns once the tx has been mined.
   * @param to - Address to send the tokens to on L2.
   * @param amount - Amount of tokens to send.
   * @param mint - Whether to mint the tokens before sending (only during testing).
   */
  public async bridgeTokensPublic(to: AztecAddress, amount: bigint, mint = false): Promise<L2AmountClaim> {
    const [claimSecret, claimSecretHash] = generateClaimSecret();
    if (mint) {
      await this.tokenManager.mint(amount, this.walletClient.account.address);
    }

    await this.tokenManager.approve(amount, this.contract.address, 'FeeJuice Portal');

    this.logger.info('Sending L1 Fee Juice to L2 to be claimed publicly');
    const args = [to.toString(), amount, claimSecretHash.toString()] as const;

    await this.contract.simulate.depositToAztecPublic(args);

    const txReceipt = await this.publicClient.waitForTransactionReceipt({
      hash: await this.contract.write.depositToAztecPublic(args),
    });

    const log = extractEvent(
      txReceipt.logs,
      this.contract.address,
      this.contract.abi,
      'DepositToAztecPublic',
      log =>
        log.args.secretHash === claimSecretHash.toString() &&
        log.args.amount === amount &&
        log.args.to === to.toString(),
      this.logger,
    );

    return {
      claimAmount: new Fr(amount),
      claimSecret,
      claimSecretHash,
      messageHash: log.args.key,
      messageLeafIndex: log.args.index,
    };
  }

  /**
   * Creates a new instance
   * @param pxe - PXE client used for retrieving the L1 contract addresses.
   * @param publicClient - L1 public client.
   * @param walletClient - L1 wallet client.
   * @param logger - Logger.
   */
  public static async new(
    pxe: PXE,
    publicClient: PublicClient<HttpTransport, Chain>,
    walletClient: WalletClient<HttpTransport, Chain, Account>,
    logger: Logger,
  ): Promise<L1FeeJuicePortalManager> {
    const {
      l1ContractAddresses: { feeJuiceAddress, feeJuicePortalAddress },
    } = await pxe.getNodeInfo();

    if (feeJuiceAddress.isZero() || feeJuicePortalAddress.isZero()) {
      throw new Error('Portal or token not deployed on L1');
    }

    return new L1FeeJuicePortalManager(feeJuicePortalAddress, feeJuiceAddress, publicClient, walletClient, logger);
  }
}

/** Helper for interacting with a test TokenPortal on L1 for sending tokens to L2. */
export class L1ToL2TokenPortalManager {
  protected readonly portal: GetContractReturnType<typeof TokenPortalAbi, WalletClient<HttpTransport, Chain, Account>>;
  protected readonly tokenManager: L1TokenManager;

  constructor(
    portalAddress: EthAddress,
    tokenAddress: EthAddress,
    protected publicClient: PublicClient<HttpTransport, Chain>,
    protected walletClient: WalletClient<HttpTransport, Chain, Account>,
    protected logger: Logger,
  ) {
    this.tokenManager = new L1TokenManager(tokenAddress, publicClient, walletClient, logger);
    this.portal = getContract({
      address: portalAddress.toString(),
      abi: TokenPortalAbi,
      client: this.walletClient,
    });
  }

  /** Returns the token manager for the underlying L1 token. */
  public getTokenManager() {
    return this.tokenManager;
  }

  /**
   * Bridges tokens from L1 to L2. Handles token approvals. Returns once the tx has been mined.
   * @param to - Address to send the tokens to on L2.
   * @param amount - Amount of tokens to send.
   * @param mint - Whether to mint the tokens before sending (only during testing).
   */
  public async bridgeTokensPublic(to: AztecAddress, amount: bigint, mint = false): Promise<L2AmountClaim> {
    const [claimSecret, claimSecretHash] = await this.bridgeSetup(amount, mint);

    this.logger.info('Sending L1 tokens to L2 to be claimed publicly');
    const { request } = await this.portal.simulate.depositToAztecPublic([
      to.toString(),
      amount,
      claimSecretHash.toString(),
    ]);

    const txReceipt = await this.publicClient.waitForTransactionReceipt({
      hash: await this.walletClient.writeContract(request),
    });

    const log = extractEvent(
      txReceipt.logs,
      this.portal.address,
      this.portal.abi,
      'DepositToAztecPublic',
      log =>
        log.args.secretHash === claimSecretHash.toString() &&
        log.args.amount === amount &&
        log.args.to === to.toString(),
      this.logger,
    );

    return {
      claimAmount: new Fr(amount),
      claimSecret,
      claimSecretHash,
      messageHash: log.args.key,
      messageLeafIndex: log.args.index,
    };
  }

  /**
   * Bridges tokens from L1 to L2 privately. Handles token approvals. Returns once the tx has been mined.
   * @param to - Address to send the tokens to on L2.
   * @param amount - Amount of tokens to send.
   * @param mint - Whether to mint the tokens before sending (only during testing).
   */
  public async bridgeTokensPrivate(
    to: AztecAddress,
    amount: bigint,
    mint = false,
  ): Promise<L2AmountClaimWithRecipient> {
    const [claimSecret, claimSecretHash] = await this.bridgeSetup(amount, mint);

    this.logger.info('Sending L1 tokens to L2 to be claimed privately');
    const { request } = await this.portal.simulate.depositToAztecPrivate([amount, claimSecretHash.toString()]);

    const txReceipt = await this.publicClient.waitForTransactionReceipt({
      hash: await this.walletClient.writeContract(request),
    });

    const log = extractEvent(
      txReceipt.logs,
      this.portal.address,
      this.portal.abi,
      'DepositToAztecPrivate',
      log => log.args.amount === amount && log.args.secretHashForL2MessageConsumption === claimSecretHash.toString(),
      this.logger,
    );

    this.logger.info(
      `Claim message secret: ${claimSecret.toString()}, claim message secret hash: ${claimSecretHash.toString()}`,
    );

    return {
      claimAmount: new Fr(amount),
      claimSecret,
      claimSecretHash,
      recipient: to,
      messageHash: log.args.key,
      messageLeafIndex: log.args.index,
    };
  }

  private async bridgeSetup(amount: bigint, mint: boolean) {
    if (mint) {
      await this.tokenManager.mint(amount, this.walletClient.account.address);
    }
    await this.tokenManager.approve(amount, this.portal.address, 'TokenPortal');
    return generateClaimSecret();
  }
}

/** Helper for interacting with a test TokenPortal on L1 for both withdrawing from and bridging to L2. */
export class L1TokenPortalManager extends L1ToL2TokenPortalManager {
  private readonly outbox: GetContractReturnType<typeof OutboxAbi, WalletClient<HttpTransport, Chain, Account>>;

  constructor(
    portalAddress: EthAddress,
    tokenAddress: EthAddress,
    outboxAddress: EthAddress,
    publicClient: PublicClient<HttpTransport, Chain>,
    walletClient: WalletClient<HttpTransport, Chain, Account>,
    logger: Logger,
  ) {
    super(portalAddress, tokenAddress, publicClient, walletClient, logger);
    this.outbox = getContract({
      address: outboxAddress.toString(),
      abi: OutboxAbi,
      client: walletClient,
    });
  }

  /**
   * Withdraws funds from the portal by consuming an L2 to L1 message. Returns once the tx is mined on L1.
   * @param amount - Amount to withdraw.
   * @param recipient - Who will receive the funds.
   * @param blockNumber - L2 block number of the message.
   * @param messageIndex - Index of the message.
   * @param siblingPath - Sibling path of the message.
   */
  public async withdrawFunds(
    amount: bigint,
    recipient: EthAddress,
    blockNumber: bigint,
    messageIndex: bigint,
    siblingPath: SiblingPath<number>,
  ) {
    this.logger.info(
      `Sending L1 tx to consume message at block ${blockNumber} index ${messageIndex} to withdraw ${amount}`,
    );

    const isConsumedBefore = await this.outbox.read.hasMessageBeenConsumedAtBlockAndIndex([blockNumber, messageIndex]);
    if (isConsumedBefore) {
      throw new Error(`L1 to L2 message at block ${blockNumber} index ${messageIndex} has already been consumed`);
    }

    // Call function on L1 contract to consume the message
    const { request: withdrawRequest } = await this.portal.simulate.withdraw([
      recipient.toString(),
      amount,
      false,
      BigInt(blockNumber),
      messageIndex,
      siblingPath.toBufferArray().map((buf: Buffer): Hex => `0x${buf.toString('hex')}`),
    ]);

    await this.publicClient.waitForTransactionReceipt({ hash: await this.walletClient.writeContract(withdrawRequest) });

    const isConsumedAfter = await this.outbox.read.hasMessageBeenConsumedAtBlockAndIndex([blockNumber, messageIndex]);
    if (!isConsumedAfter) {
      throw new Error(`L1 to L2 message at block ${blockNumber} index ${messageIndex} not consumed after withdrawal`);
    }
  }

  /**
   * Computes the L2 to L1 message leaf for the given parameters.
   * @param amount - Amount to bridge.
   * @param recipient - Recipient on L1.
   * @param l2Bridge - Address of the L2 bridge.
   * @param callerOnL1 - Caller address on L1.
   */
  public getL2ToL1MessageLeaf(
    amount: bigint,
    recipient: EthAddress,
    l2Bridge: AztecAddress,
    callerOnL1: EthAddress = EthAddress.ZERO,
  ): Fr {
    const content = sha256ToField([
      Buffer.from(toFunctionSelector('withdraw(address,uint256,address)').substring(2), 'hex'),
      recipient.toBuffer32(),
      new Fr(amount).toBuffer(),
      callerOnL1.toBuffer32(),
    ]);
    const leaf = sha256ToField([
      l2Bridge.toBuffer(),
      new Fr(1).toBuffer(), // aztec version
      EthAddress.fromString(this.portal.address).toBuffer32() ?? Buffer.alloc(32, 0),
      new Fr(this.publicClient.chain.id).toBuffer(), // chain id
      content.toBuffer(),
    ]);

    return leaf;
  }
}
