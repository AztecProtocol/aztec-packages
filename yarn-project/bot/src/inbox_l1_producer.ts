import { InboxContract, MULTI_CALL_3_ADDRESS } from '@aztec/ethereum/contracts';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { type Hex, TransactionReceiptNotFoundError } from 'viem';

import {
  type L1ToL2MessageBatchMismatch,
  type L1ToL2MessageBatchReceipt,
  type L1ToL2MessageIntent,
  type SentInboxMessage,
  assertMulticall3Deployed,
  awaitL1ToL2MessageBatch,
  isL1BlockCanonical,
  sendL1ToL2MessageBatch,
  validateL1ToL2MessageBatch,
} from './l1_to_l2_seeding.js';

/**
 * The L1 side of the inbox bot's producer, kept behind an interface so the production schedule, the
 * outstanding-message cap and restart recovery can be exercised without a chain.
 */
export interface InboxL1Producer {
  /** L1 address the Inbox records as the sender of the messages this producer sends. */
  readonly expectedSender: string;

  /** Throws if the L1 the producer is pointed at cannot carry a batched send. */
  assertReady(): Promise<void>;

  /**
   * Sends one atomic batch. `onNonceClaimed` runs before the transaction is broadcast and `onBroadcast` as soon
   * as its hash is known, so the caller can make the submission durable before it becomes uncertain.
   */
  sendBatch(args: {
    intents: readonly L1ToL2MessageIntent[];
    onNonceClaimed: (nonce: number) => Promise<void>;
    onBroadcast: (txHash: string) => Promise<void>;
  }): Promise<L1ToL2MessageBatchReceipt>;

  /** Looks up an already broadcast batch without waiting for it. Returns undefined while it is still pending. */
  getBatchOutcome(txHash: string): Promise<L1ToL2MessageBatchReceipt | undefined>;

  /** Number of transactions the sending account has confirmed, used to tell a lost broadcast from a pending one. */
  getConfirmedNonce(): Promise<number>;

  /** Whether the given block is still canonical at its height. */
  isBlockCanonical(blockNumber: bigint, blockHash: string): Promise<boolean>;

  /**
   * Messages an Inbox bucket held as of the given L1 block, or undefined when it cannot be read — the ring may
   * have evicted the bucket, or the node may not serve state at that height.
   */
  getBucketMessageCount(bucketSeq: bigint, atL1BlockNumber: bigint): Promise<number | undefined>;

  /** Compares a mined batch against the intent that was persisted before it was broadcast. */
  validateBatch(
    intents: readonly L1ToL2MessageIntent[],
    messages: readonly SentInboxMessage[],
  ): L1ToL2MessageBatchMismatch[];
}

/** {@link InboxL1Producer} backed by a viem client sending through Multicall3. */
export class ViemInboxL1Producer implements InboxL1Producer {
  /**
   * Multicall3 forwards each `sendL2Message` call itself, so the Inbox records the forwarder as the L1 sender
   * rather than the signing account. Consumption on L2 must be built against this address.
   */
  public readonly expectedSender: string = MULTI_CALL_3_ADDRESS;

  private readonly inbox: InboxContract;

  constructor(
    private readonly l1Client: ExtendedViemWalletClient,
    private readonly inboxAddress: EthAddress,
    private readonly recipient: AztecAddress,
    private readonly rollupVersion: bigint,
    private readonly log: Logger,
  ) {
    this.inbox = new InboxContract(l1Client, inboxAddress);
  }

  public assertReady(): Promise<void> {
    return assertMulticall3Deployed(this.l1Client);
  }

  public sendBatch(args: {
    intents: readonly L1ToL2MessageIntent[];
    onNonceClaimed: (nonce: number) => Promise<void>;
    onBroadcast: (txHash: string) => Promise<void>;
  }): Promise<L1ToL2MessageBatchReceipt> {
    return sendL1ToL2MessageBatch({
      l1Client: this.l1Client,
      inboxAddress: this.inboxAddress,
      recipient: this.recipient,
      rollupVersion: this.rollupVersion,
      intents: args.intents,
      log: this.log,
      onNonceClaimed: args.onNonceClaimed,
      onBroadcast: args.onBroadcast,
    });
  }

  public async getBatchOutcome(txHash: string): Promise<L1ToL2MessageBatchReceipt | undefined> {
    try {
      await this.l1Client.getTransactionReceipt({ hash: txHash as Hex });
    } catch (err) {
      // Only the node saying it has no such receipt means the batch is still pending. Any other failure is the
      // transport's, and reporting it as pending would abandon a batch that did mine.
      if (err instanceof TransactionReceiptNotFoundError) {
        return undefined;
      }
      throw err;
    }
    return await awaitL1ToL2MessageBatch({
      l1Client: this.l1Client,
      inboxAddress: this.inboxAddress,
      txHash: txHash as Hex,
    });
  }

  public async getConfirmedNonce(): Promise<number> {
    const account = this.l1Client.account;
    if (!account) {
      throw new Error(`L1 client has no account`);
    }
    return await this.l1Client.getTransactionCount({ address: account.address, blockTag: 'latest' });
  }

  public isBlockCanonical(blockNumber: bigint, blockHash: string): Promise<boolean> {
    return isL1BlockCanonical(this.l1Client, blockNumber, blockHash);
  }

  public async getBucketMessageCount(bucketSeq: bigint, atL1BlockNumber: bigint): Promise<number | undefined> {
    try {
      const bucket = await this.inbox.getBucket(bucketSeq, { blockNumber: atL1BlockNumber });
      return bucket.msgCount;
    } catch (err) {
      this.log.debug(`Could not read Inbox bucket ${bucketSeq} at L1 block ${atL1BlockNumber}`, { err });
      return undefined;
    }
  }

  public validateBatch(
    intents: readonly L1ToL2MessageIntent[],
    messages: readonly SentInboxMessage[],
  ): L1ToL2MessageBatchMismatch[] {
    return validateL1ToL2MessageBatch({
      intents,
      messages,
      recipient: this.recipient,
      rollupVersion: this.rollupVersion,
      expectedSender: this.expectedSender,
    });
  }
}
