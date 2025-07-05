import type { ExtendedViemWalletClient, ViemContract } from '@aztec/ethereum';
import { extractEvent } from '@aztec/ethereum/utils';
import { sha256ToField } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import type { SiblingPath } from '@aztec/foundation/trees';
import { FeeAssetHandlerAbi } from '@aztec/l1-artifacts/FeeAssetHandlerAbi';
import { FeeJuicePortalAbi } from '@aztec/l1-artifacts/FeeJuicePortalAbi';
import { OutboxAbi } from '@aztec/l1-artifacts/OutboxAbi';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';
import { TokenPortalAbi } from '@aztec/l1-artifacts/TokenPortalAbi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeL2ToL1MessageHash, computeSecretHash } from '@aztec/stdlib/hash';
import type { PXE } from '@aztec/stdlib/interfaces/client';

import { type Hex, getContract, toFunctionSelector } from 'viem';

import type { Wallet } from '../index.js';

// docs:start:claim_type
// docs:start:claim_type_amount
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
// docs:end:claim_type

/** L1 to L2 message info that corresponds to an amount to claim. */
export type L2AmountClaim = L2Claim & { /** Amount to claim */ claimAmount: bigint };
// docs:end:claim_type_amount

/** L1 to L2 message info that corresponds to an amount to claim with associated recipient. */
export type L2AmountClaimWithRecipient = L2AmountClaim & {
  /** Address that will receive the newly minted notes. */ recipient: AztecAddress;
};

/** Stringifies an eth address for logging. */
function stringifyEthAddress(address: EthAddress | Hex, name?: string) {
  return name ? `${name} (${address.toString()})` : address.toString();
}

/** Generates a pair secret and secret hash */
export async function generateClaimSecret(logger?: Logger): Promise<[Fr, Fr]> {
  const secret = Fr.random();
  const secretHash = await computeSecretHash(secret);
  logger?.verbose(`Generated claim secret=${secret.toString()} hash=${secretHash.toString()}`);
  return [secret, secretHash];
}

/** Helper for managing an ERC20 on L1. */
export class L1TokenManager {
  private contract: ViemContract<typeof TestERC20Abi>;
  private handler: ViemContract<typeof FeeAssetHandlerAbi> | undefined;

  public constructor(
    /** Address of the ERC20 contract. */
    public readonly tokenAddress: EthAddress,
    private readonly extendedClient: ExtendedViemWalletClient,
    private logger: Logger,
    /** Address of the handler/faucet contract. */
    public readonly handlerAddress: EthAddress | undefined = undefined,
  ) {
    this.contract = getContract({
      address: this.tokenAddress.toString(),
      abi: TestERC20Abi,
      client: this.extendedClient,
    });
    if (this.handlerAddress) {
      this.handler = getContract({
        address: this.handlerAddress.toString(),
        abi: FeeAssetHandlerAbi,
        client: this.extendedClient,
      });
    }
  }

  /** Returns the amount of tokens available to mint via the handler.
   * @throws if the handler is not provided.
   */
  public async getMintAmount() {
    if (!this.handler) {
      throw new Error('Minting handler was not provided');
    }
    return await this.handler.read.mintAmount();
  }

  /**
   * Returns the balance of the given address.
   * @param address - Address to get the balance of.
   */
  public async getL1TokenBalance(address: Hex) {
    return await this.contract.read.balanceOf([address]);
  }

  /**
   * Mints a fixed amount of tokens for the given address. Returns once the tx has been mined.
   * @param amount - Amount to mint. Only used if a handler is not provided.
   * @param address - Address to mint the tokens for.
   * @param addressName - Optional name of the address for logging.
   * @returns The amount of tokens minted.
   */
  public async mint(amount: bigint | undefined, address: Hex, addressName?: string) {
    if (this.handler) {
      if (amount) {
        this.logger.warn('Amount provided but handler is provided, ignoring amount');
      }
      const mintAmount = await this.getMintAmount();
      this.logger.info(`Minting ${mintAmount} tokens for ${stringifyEthAddress(address, addressName)}`);
      await this.handler.write.mint([address]);
      return mintAmount;
    } else if (amount) {
      this.logger.info(`Minting ${amount} tokens for ${stringifyEthAddress(address, addressName)}`);
      await this.contract.write.mint([address, amount]);
      return amount;
    } else {
      throw new Error('Amount must be provided if no handler is provided');
    }
  }
  /**
   * Approves tokens for the given address. Returns once the tx has been mined.
   * @param amount - Amount to approve.
   * @param address - Address to approve the tokens for.
   * @param addressName - Optional name of the address for logging.
   */
  public async approve(amount: bigint, address: Hex, addressName = '') {
    this.logger.info(`Approving ${amount} tokens for ${stringifyEthAddress(address, addressName)}`);
    await this.extendedClient.waitForTransactionReceipt({
      hash: await this.contract.write.approve([address, amount]),
    });
  }
}

/** Helper for interacting with the FeeJuicePortal on L1. */
export class L1FeeJuicePortalManager {
  private readonly tokenManager: L1TokenManager;
  private readonly contract: ViemContract<typeof FeeJuicePortalAbi>;

  constructor(
    portalAddress: EthAddress,
    tokenAddress: EthAddress,
    private readonly extendedClient: ExtendedViemWalletClient,
    private readonly logger: Logger,
    handlerAddress: EthAddress | undefined = undefined,
  ) {
    this.tokenManager = new L1TokenManager(tokenAddress, extendedClient, logger, handlerAddress);
    this.contract = getContract({
      address: portalAddress.toString(),
      abi: FeeJuicePortalAbi,
      client: extendedClient,
    });
  }

  /** Returns the associated token manager for the L1 ERC20. */
  public getTokenManager() {
    return this.tokenManager;
  }

  private async bridgeTokens(to: AztecAddress, amount: bigint, claimSecret: Fr, claimSecretHash: Fr) {
    await this.tokenManager.approve(amount, this.contract.address, 'FeeJuice Portal');
    this.logger.info('Sending L1 Fee Juice to L2 to be claimed publicly');
    const args = [to.toString(), amount, claimSecretHash.toString()] as const;

    await this.contract.simulate.depositToAztecPublic(args);

    const txReceipt = await this.extendedClient.waitForTransactionReceipt({
      hash: await this.contract.write.depositToAztecPublic(args),
    });

    this.logger.info('Deposited to Aztec public successfully');

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
      claimAmount: amount,
      claimSecret,
      claimSecretHash,
      messageHash: log.args.key,
      messageLeafIndex: log.args.index,
    };
  }

  /**
   * Bridges tokens to L2 after minting from the faucet on L1.
   * @param to - Address to send the tokens to on L2.
   */
  public async bridgeTokensFromFaucet(to: AztecAddress) {
    const [claimSecret, claimSecretHash] = await generateClaimSecret();

    const amountToBridge = await this.tokenManager.mint(undefined, this.extendedClient.account.address);
    if (!amountToBridge) {
      throw new Error('Amount must be provided if not minting');
    }

    return this.bridgeTokens(to, amountToBridge, claimSecret, claimSecretHash);
  }

  /**
   * Bridges tokens to L2 after minting directly from the L1 ERC20.
   * @param to - Address to send the tokens to on L2.
   * @param amount - Amount of tokens to mint and bridge.
   */
  public async bridgeTokensAsMinter(to: AztecAddress, amount: bigint) {
    const [claimSecret, claimSecretHash] = await generateClaimSecret();

    const amountToBridge = await this.tokenManager.mint(amount, this.extendedClient.account.address);
    if (!amountToBridge) {
      throw new Error('Amount must be provided if not minting');
    }

    return this.bridgeTokens(to, amountToBridge, claimSecret, claimSecretHash);
  }

  /**
   * Creates a new instance
   * @param walletOrPxe - Wallet or PXE client used for retrieving the L1 contract addresses.
   * @param extendedClient - Wallet client, extended with public actions.
   * @param logger - Logger.
   */
  public static async new(
    walletOrPxe: Wallet | PXE,
    extendedClient: ExtendedViemWalletClient,
    logger: Logger,
  ): Promise<L1FeeJuicePortalManager> {
    const {
      l1ContractAddresses: { feeJuiceAddress, feeJuicePortalAddress, feeAssetHandlerAddress },
    } = await walletOrPxe.getNodeInfo();

    if (feeJuiceAddress.isZero() || feeJuicePortalAddress.isZero()) {
      throw new Error('Portal or token not deployed on L1');
    }

    return new L1FeeJuicePortalManager(
      feeJuicePortalAddress,
      feeJuiceAddress,
      extendedClient,
      logger,
      feeAssetHandlerAddress,
    );
  }
}

/** Helper for interacting with a test TokenPortal on L1 for sending tokens to L2. */
export class L1ToL2TokenPortalManager {
  protected readonly portal: ViemContract<typeof TokenPortalAbi>;
  protected readonly tokenManager: L1TokenManager;

  constructor(
    portalAddress: EthAddress,
    tokenAddress: EthAddress,
    protected extendedClient: ExtendedViemWalletClient,
    protected logger: Logger,
    handlerAddress: EthAddress | undefined = undefined,
  ) {
    this.tokenManager = new L1TokenManager(tokenAddress, extendedClient, logger, handlerAddress);
    this.portal = getContract({
      address: portalAddress.toString(),
      abi: TokenPortalAbi,
      client: extendedClient,
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

    const txReceipt = await this.extendedClient.waitForTransactionReceipt({
      hash: await this.extendedClient.writeContract(request),
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
      claimAmount: amount,
      claimSecret,
      claimSecretHash,
      messageHash: log.args.key,
      messageLeafIndex: log.args.index,
    };
  }

  // docs:start:bridge_tokens_private
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
    // docs:end:bridge_tokens_private
    const [claimSecret, claimSecretHash] = await this.bridgeSetup(amount, mint);

    this.logger.info('Sending L1 tokens to L2 to be claimed privately');
    const { request } = await this.portal.simulate.depositToAztecPrivate([amount, claimSecretHash.toString()]);

    const txReceipt = await this.extendedClient.waitForTransactionReceipt({
      hash: await this.extendedClient.writeContract(request),
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
      claimAmount: amount,
      claimSecret,
      claimSecretHash,
      recipient: to,
      messageHash: log.args.key,
      messageLeafIndex: log.args.index,
    };
  }

  private async bridgeSetup(amount: bigint, mint: boolean) {
    if (mint) {
      await this.tokenManager.mint(amount, this.extendedClient.account.address);
    }
    await this.tokenManager.approve(amount, this.portal.address, 'TokenPortal');
    return generateClaimSecret();
  }
}

/** Helper for interacting with a test TokenPortal on L1 for both withdrawing from and bridging to L2. */
export class L1TokenPortalManager extends L1ToL2TokenPortalManager {
  private readonly outbox: ViemContract<typeof OutboxAbi>;

  constructor(
    portalAddress: EthAddress,
    tokenAddress: EthAddress,
    outboxAddress: EthAddress,
    extendedClient: ExtendedViemWalletClient,
    logger: Logger,
  ) {
    super(portalAddress, tokenAddress, extendedClient, logger, undefined);
    this.outbox = getContract({
      address: outboxAddress.toString(),
      abi: OutboxAbi,
      client: extendedClient,
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

    await this.extendedClient.waitForTransactionReceipt({
      hash: await this.extendedClient.writeContract(withdrawRequest),
    });

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
  public async getL2ToL1MessageLeaf(
    amount: bigint,
    recipient: EthAddress,
    l2Bridge: AztecAddress,
    callerOnL1: EthAddress = EthAddress.ZERO,
  ): Promise<Fr> {
    const version = await this.outbox.read.VERSION();

    const content = sha256ToField([
      Buffer.from(toFunctionSelector('withdraw(address,uint256,address)').substring(2), 'hex'),
      recipient.toBuffer32(),
      new Fr(amount).toBuffer(),
      callerOnL1.toBuffer32(),
    ]);

    return computeL2ToL1MessageHash({
      l2Sender: l2Bridge,
      l1Recipient: EthAddress.fromString(this.portal.address),
      content,
      rollupVersion: new Fr(version),
      chainId: new Fr(this.extendedClient.chain.id),
    });
  }
}
