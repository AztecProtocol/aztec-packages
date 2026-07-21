import {
  type L1TxConfig,
  type L1TxUtils,
  createL1TxUtils,
  getL1TxUtilsConfigEnvVars,
} from '@aztec/ethereum/l1-tx-utils';
import type { ExtendedViemWalletClient, ViemContract } from '@aztec/ethereum/types';
import { extractEvent } from '@aztec/ethereum/utils';
import type { EpochNumber } from '@aztec/foundation/branded-types';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import type { SiblingPath } from '@aztec/foundation/trees';
import { FeeAssetHandlerAbi } from '@aztec/l1-artifacts/FeeAssetHandlerAbi';
import { FeeJuicePortalAbi } from '@aztec/l1-artifacts/FeeJuicePortalAbi';
import { OutboxAbi } from '@aztec/l1-artifacts/OutboxAbi';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';
import { TokenPortalAbi } from '@aztec/l1-artifacts/TokenPortalAbi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeL2ToL1MessageHash, computeSecretHash } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { getL2ToL1MessageLeafId } from '@aztec/stdlib/messaging';

import { type Hex, encodeFunctionData, getContract, toFunctionSelector } from 'viem';

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
export type L2AmountClaim = L2Claim & { /** Amount to claim */ claimAmount: bigint };

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

// `Inbox.sendL2Message` (reached by every `depositToAztec*` call) inserts into a height-10
// (`L1_TO_L2_MSG_SUBTREE_HEIGHT`) incremental frontier tree. The per-insert cost swings by up to ~10 hash levels
// (which translates to ~40k gas) depending on where the global message index lands when the tx is mined: inserts that
// complete a subtree cascade through cold SLOADs + an SSTORE vs cheap inserts that touch one slot. A point-in-time
// `eth_estimateGas` taken at a cheap index therefore under-sizes a deposit that mines at a subtree boundary. That ~40k
// swing exceeds the default 20% buffer on a ~100k deposit. That is why we raise the gas-limit buffer to 2x here.
// Note: a larger operator override via L1_GAS_LIMIT_BUFFER_PERCENTAGE still wins.
const INBOX_DEPOSIT_GAS_LIMIT_BUFFER_PERCENTAGE = 100;

/** Per-call gas config for `depositToAztec*`: the Inbox-deposit buffer floor, or a larger operator override. */
function inboxDepositGasConfig(): L1TxConfig {
  const configuredBuffer = getL1TxUtilsConfigEnvVars().gasLimitBufferPercentage ?? 0;
  return { gasLimitBufferPercentage: Math.max(configuredBuffer, INBOX_DEPOSIT_GAS_LIMIT_BUFFER_PERCENTAGE) };
}

/** Helper for managing an ERC20 on L1. */
export class L1TokenManager {
  private contract: ViemContract<typeof TestERC20Abi>;
  private handler: ViemContract<typeof FeeAssetHandlerAbi> | undefined;
  private readonly l1TxUtils: L1TxUtils;

  public constructor(
    /** Address of the ERC20 contract. */
    public readonly tokenAddress: EthAddress,
    /** Address of the handler/faucet contract. */
    public readonly handlerAddress: EthAddress | undefined,
    private readonly extendedClient: ExtendedViemWalletClient,
    private logger: Logger,
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
    this.l1TxUtils = createL1TxUtils(this.extendedClient, { logger }, getL1TxUtilsConfigEnvVars());
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
   * @param address - Address to mint the tokens for.
   * @param addressName - Optional name of the address for logging.
   */
  public async mint(address: Hex, addressName?: string) {
    if (!this.handler) {
      throw new Error('Minting handler was not provided');
    }
    const mintAmount = await this.getMintAmount();
    this.logger.info(`Minting ${mintAmount} tokens for ${stringifyEthAddress(address, addressName)}`);
    // NOTE: the handler mints a fixed amount.
    await this.l1TxUtils.sendAndMonitorTransaction({
      to: this.handler.address,
      abi: FeeAssetHandlerAbi,
      data: encodeFunctionData({ abi: FeeAssetHandlerAbi, functionName: 'mint', args: [address] }),
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
    await this.l1TxUtils.sendAndMonitorTransaction({
      to: this.contract.address,
      abi: TestERC20Abi,
      data: encodeFunctionData({ abi: TestERC20Abi, functionName: 'approve', args: [address, amount] }),
    });
  }
}

/** Helper for interacting with the FeeJuicePortal on L1. */
export class L1FeeJuicePortalManager {
  private readonly tokenManager: L1TokenManager;
  private readonly contract: ViemContract<typeof FeeJuicePortalAbi>;
  private readonly l1TxUtils: L1TxUtils;

  constructor(
    portalAddress: EthAddress,
    tokenAddress: EthAddress,
    handlerAddress: EthAddress | undefined,
    private readonly extendedClient: ExtendedViemWalletClient,
    private readonly logger: Logger,
  ) {
    this.tokenManager = new L1TokenManager(tokenAddress, handlerAddress, extendedClient, logger);
    this.contract = getContract({
      address: portalAddress.toString(),
      abi: FeeJuicePortalAbi,
      client: extendedClient,
    });
    this.l1TxUtils = createL1TxUtils(extendedClient, { logger }, getL1TxUtilsConfigEnvVars());
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
  public async bridgeTokensPublic(to: AztecAddress, amount: bigint | undefined, mint = false): Promise<L2AmountClaim> {
    const [claimSecret, claimSecretHash] = await generateClaimSecret();
    const amountToBridge = amount ?? (await this.tokenManager.getMintAmount());
    if (mint) {
      const mintableAmount = await this.tokenManager.getMintAmount();
      if (amountToBridge !== mintableAmount) {
        throw new Error(`Minting amount must be ${mintableAmount}`);
      }
      await this.tokenManager.mint(this.extendedClient.account.address);
    }

    await this.tokenManager.approve(amountToBridge, this.contract.address, 'FeeJuice Portal');

    this.logger.info('Sending L1 Fee Juice to L2 to be claimed publicly');
    const args = [to.toString(), amountToBridge, claimSecretHash.toString()] as const;

    await this.contract.simulate.depositToAztecPublic(args);

    const { receipt: txReceipt } = await this.l1TxUtils.sendAndMonitorTransaction(
      {
        to: this.contract.address,
        abi: FeeJuicePortalAbi,
        data: encodeFunctionData({ abi: FeeJuicePortalAbi, functionName: 'depositToAztecPublic', args }),
      },
      inboxDepositGasConfig(),
    );

    this.logger.info('Deposited to Aztec public successfully', { txReceipt });

    const log = extractEvent(
      txReceipt.logs,
      this.contract.address,
      this.contract.abi,
      'DepositToAztecPublic',
      log => {
        // Normalize hex strings for comparison (case-insensitive, handle different formats)
        const normalizeHex = (val: string | bigint | number) => {
          const hexStr = typeof val === 'string' ? val : `0x${val.toString(16).padStart(64, '0')}`;
          return hexStr.toLowerCase();
        };

        const secretHashMatch = normalizeHex(log.args.secretHash) === normalizeHex(claimSecretHash.toString());
        const amountMatch = log.args.amount === amountToBridge;
        const toMatch = normalizeHex(log.args.to) === normalizeHex(to.toString());

        this.logger.debug(
          `Event filter matching: secretHash=${secretHashMatch} (${log.args.secretHash} vs ${claimSecretHash.toString()}), ` +
            `amount=${amountMatch} (${log.args.amount} vs ${amountToBridge}), ` +
            `to=${toMatch} (${log.args.to} vs ${to.toString()})`,
        );

        return secretHashMatch && amountMatch && toMatch;
      },
      this.logger,
    );

    return {
      claimAmount: amountToBridge,
      claimSecret,
      claimSecretHash,
      messageHash: log.args.key,
      messageLeafIndex: log.args.index,
    };
  }

  /**
   * Creates a new instance
   * @param node - Aztec node client used for retrieving the L1 contract addresses.
   * @param extendedClient - Wallet client, extended with public actions.
   * @param logger - Logger.
   */
  public static async new(
    node: AztecNode,
    extendedClient: ExtendedViemWalletClient,
    logger: Logger,
  ): Promise<L1FeeJuicePortalManager> {
    const {
      l1ContractAddresses: { feeJuiceAddress, feeJuicePortalAddress, feeAssetHandlerAddress },
    } = await node.getNodeInfo();

    if (feeJuiceAddress.isZero() || feeJuicePortalAddress.isZero()) {
      throw new Error('Portal or token not deployed on L1');
    }

    // Handler is optional - it's only needed for minting tokens during testing
    const handlerAddress =
      feeAssetHandlerAddress && !feeAssetHandlerAddress.isZero() ? feeAssetHandlerAddress : undefined;

    return new L1FeeJuicePortalManager(feeJuicePortalAddress, feeJuiceAddress, handlerAddress, extendedClient, logger);
  }
}

/** Helper for interacting with a test TokenPortal on L1 for sending tokens to L2. */
export class L1ToL2TokenPortalManager {
  protected readonly portal: ViemContract<typeof TokenPortalAbi>;
  protected readonly tokenManager: L1TokenManager;
  protected readonly l1TxUtils: L1TxUtils;

  constructor(
    portalAddress: EthAddress,
    tokenAddress: EthAddress,
    handlerAddress: EthAddress | undefined,
    protected extendedClient: ExtendedViemWalletClient,
    protected logger: Logger,
  ) {
    this.tokenManager = new L1TokenManager(tokenAddress, handlerAddress, extendedClient, logger);
    this.portal = getContract({
      address: portalAddress.toString(),
      abi: TokenPortalAbi,
      client: extendedClient,
    });
    this.l1TxUtils = createL1TxUtils(extendedClient, { logger }, getL1TxUtilsConfigEnvVars());
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
    const args = [to.toString(), amount, claimSecretHash.toString()] as const;
    await this.portal.simulate.depositToAztecPublic(args);

    const { receipt: txReceipt } = await this.l1TxUtils.sendAndMonitorTransaction(
      {
        to: this.portal.address,
        abi: TokenPortalAbi,
        data: encodeFunctionData({ abi: TokenPortalAbi, functionName: 'depositToAztecPublic', args }),
      },
      inboxDepositGasConfig(),
    );

    const log = extractEvent(
      txReceipt.logs,
      this.portal.address,
      this.portal.abi,
      'DepositToAztecPublic',
      log => {
        // Normalize hex strings for comparison (case-insensitive, handle different formats)
        const normalizeHex = (val: string | bigint | number) => {
          const hexStr = typeof val === 'string' ? val : `0x${val.toString(16).padStart(64, '0')}`;
          return hexStr.toLowerCase();
        };

        return (
          normalizeHex(log.args.secretHash) === normalizeHex(claimSecretHash.toString()) &&
          log.args.amount === amount &&
          normalizeHex(log.args.to) === normalizeHex(to.toString())
        );
      },
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
    const args = [amount, claimSecretHash.toString()] as const;
    await this.portal.simulate.depositToAztecPrivate(args);

    const { receipt: txReceipt } = await this.l1TxUtils.sendAndMonitorTransaction(
      {
        to: this.portal.address,
        abi: TokenPortalAbi,
        data: encodeFunctionData({ abi: TokenPortalAbi, functionName: 'depositToAztecPrivate', args }),
      },
      inboxDepositGasConfig(),
    );

    const log = extractEvent(
      txReceipt.logs,
      this.portal.address,
      this.portal.abi,
      'DepositToAztecPrivate',
      log => {
        // Normalize hex strings for comparison (case-insensitive, handle different formats)
        const normalizeHex = (val: string | bigint | number) => {
          const hexStr = typeof val === 'string' ? val : `0x${val.toString(16).padStart(64, '0')}`;
          return hexStr.toLowerCase();
        };

        return (
          log.args.amount === amount &&
          normalizeHex(log.args.secretHashForL2MessageConsumption) === normalizeHex(claimSecretHash.toString())
        );
      },
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
      const mintableAmount = await this.tokenManager.getMintAmount();
      if (amount !== mintableAmount) {
        throw new Error(`Minting amount must be ${mintableAmount} for testing`);
      }
      await this.tokenManager.mint(this.extendedClient.account.address);
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
    handlerAddress: EthAddress | undefined,
    outboxAddress: EthAddress,
    extendedClient: ExtendedViemWalletClient,
    logger: Logger,
  ) {
    super(portalAddress, tokenAddress, handlerAddress, extendedClient, logger);
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
   * @param epochNumber - Epoch number of the message.
   * @param numCheckpointsInEpoch - The partial-proof depth (1-indexed) the witness was built against.
   * @param messageIndex - Index of the message.
   * @param siblingPath - Sibling path of the message.
   */
  public async withdrawFunds(
    amount: bigint,
    recipient: EthAddress,
    epochNumber: EpochNumber,
    numCheckpointsInEpoch: number,
    messageIndex: bigint,
    siblingPath: SiblingPath<number>,
  ) {
    this.logger.info(
      `Sending L1 tx to consume message at epoch ${epochNumber} numCheckpointsInEpoch ${numCheckpointsInEpoch} index ${messageIndex} to withdraw ${amount}`,
    );

    const messageLeafId = getL2ToL1MessageLeafId({ leafIndex: messageIndex, siblingPath });
    const isConsumedBefore = await this.outbox.read.hasMessageBeenConsumedAtEpoch([BigInt(epochNumber), messageLeafId]);
    if (isConsumedBefore) {
      throw new Error(
        `L2 to L1 message at epoch ${epochNumber} index ${messageIndex} height ${siblingPath.pathSize} has already been consumed`,
      );
    }

    // Call function on L1 contract to consume the message
    const withdrawArgs = [
      recipient.toString(),
      amount,
      false,
      BigInt(epochNumber),
      BigInt(numCheckpointsInEpoch),
      messageIndex,
      siblingPath.toBufferArray().map((buf: Buffer): Hex => `0x${buf.toString('hex')}`),
    ] as const;
    await this.portal.simulate.withdraw(withdrawArgs);

    await this.l1TxUtils.sendAndMonitorTransaction({
      to: this.portal.address,
      abi: TokenPortalAbi,
      data: encodeFunctionData({ abi: TokenPortalAbi, functionName: 'withdraw', args: withdrawArgs }),
    });

    const isConsumedAfter = await this.outbox.read.hasMessageBeenConsumedAtEpoch([BigInt(epochNumber), messageLeafId]);
    if (!isConsumedAfter) {
      throw new Error(
        `L2 to L1 message at epoch ${epochNumber} index ${messageIndex} height ${siblingPath.pathSize} not consumed after withdrawal`,
      );
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
