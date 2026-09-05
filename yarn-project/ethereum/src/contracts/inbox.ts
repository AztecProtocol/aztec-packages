import { maxBigint } from '@aztec/foundation/bigint';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { InboxAbi } from '@aztec/l1-artifacts/InboxAbi';

import { type BlockTag, type GetContractReturnType, type Hex, getContract } from 'viem';

import { getPublicClient } from '../client.js';
import type { DeployAztecL1ContractsReturnType } from '../deploy_aztec_l1_contracts.js';
import type { L1ReaderConfig } from '../l1_reader.js';
import type { ViemClient } from '../types.js';
import { formatViemError } from '../utils.js';
import type { L1EventLog } from './log.js';
import { checkBlockTag, getRevertedErrorName } from './utils.js';

/** The full L1-to-L2 message emitted by the Inbox, decoded from the event. Hashing it yields `leaf`. */
export type MessageSentMessage = {
  sender: { actor: `0x${string}`; chainId: bigint };
  recipient: { actor: Fr; version: bigint };
  content: Fr;
  secretHash: Fr;
  index: bigint;
};

/** Arguments for the MessageSent event. */
export type MessageSentArgs = {
  /** Compact cumulative index of the message in the Inbox insertion order (lifted from `message.index`). */
  index: bigint;
  leaf: Fr;
  /** Consensus rolling hash (truncated sha256 chain) after this message. */
  inboxRollingHash: Fr;
  /** Sequence number of the Inbox bucket this message was absorbed into. */
  bucketSeq: bigint;
  /** The full message as emitted, making the event a self-contained record. */
  message: MessageSentMessage;
};

/** Log type for MessageSent events. */
export type MessageSentLog = L1EventLog<MessageSentArgs>;

export class InboxContract {
  private readonly inbox: GetContractReturnType<typeof InboxAbi, ViemClient>;

  static getFromL1ContractsValues(deployL1ContractsValues: DeployAztecL1ContractsReturnType) {
    const {
      l1Client,
      l1ContractAddresses: { inboxAddress },
    } = deployL1ContractsValues;
    return new InboxContract(l1Client, inboxAddress.toString());
  }

  static getFromConfig(config: L1ReaderConfig) {
    const client = getPublicClient(config);
    const address = config.inboxAddress.toString();
    return new InboxContract(client, address);
  }

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    this.inbox = getContract({ address, abi: InboxAbi, client });
  }

  public get address() {
    return this.inbox.address;
  }

  public getContract(): GetContractReturnType<typeof InboxAbi, ViemClient> {
    return this.inbox;
  }

  /**
   * Returns the Inbox's live chain position in one atomic call: the consensus rolling hash and cumulative total
   * after the most recent message, plus the current bucket sequence. Used by the archiver's message sync and
   * L1-reorg detection.
   */
  public async getState(opts: { blockTag?: BlockTag; blockNumber?: bigint } = {}): Promise<InboxContractState> {
    await checkBlockTag(opts.blockNumber, this.client);
    const state = await this.inbox.read.getState(opts);
    return {
      rollingHash: Fr.fromString(state.rollingHash),
      totalMessagesInserted: state.totalMessagesInserted,
      currentBucketSeq: state.currentBucketSeq,
    };
  }

  /** Returns the sequence number of the Inbox bucket currently accumulating messages. */
  public async getCurrentBucketSeq(opts: { blockTag?: BlockTag; blockNumber?: bigint } = {}): Promise<bigint> {
    await checkBlockTag(opts.blockNumber, this.client);
    return this.inbox.read.getCurrentBucketSeq(opts);
  }

  /** Returns the Inbox bucket with the given sequence number. */
  public async getBucket(
    seq: bigint,
    opts: { blockTag?: BlockTag; blockNumber?: bigint } = {},
  ): Promise<InboxContractBucket> {
    await checkBlockTag(opts.blockNumber, this.client);
    const bucket = await this.inbox.read.getBucket([seq], opts);
    return toInboxContractBucket(bucket);
  }

  /**
   * Returns the live Inbox bucket with the greatest cumulative message total at or below `upperBound`, together with
   * its sequence number. Resolves to `undefined` when even the oldest retained bucket ends past the bound, i.e. the
   * ring has already evicted every bucket that could have matched. Totals strictly increase per bucket, so the result
   * is the newest bucket boundary reachable from a local message count.
   */
  public async getBucketAtOrBeforeTotal(
    upperBound: bigint,
    opts: { blockTag?: BlockTag; blockNumber?: bigint } = {},
  ): Promise<{ seq: bigint; bucket: InboxContractBucket } | undefined> {
    await checkBlockTag(opts.blockNumber, this.client);
    try {
      const [seq, bucket] = await this.inbox.read.getBucketAtOrBeforeTotal([upperBound], opts);
      return { seq, bucket: toInboxContractBucket(bucket) };
    } catch (err) {
      if (getRevertedErrorName(err) === 'Inbox__NoBucketAtOrBeforeTotal') {
        return undefined;
      }
      throw formatViemError(err);
    }
  }

  /** Fetches MessageSent events within the given block range. */
  async getMessageSentEvents(fromBlock: bigint, toBlock: bigint): Promise<MessageSentLog[]> {
    const logs = (await this.inbox.getEvents.MessageSent({}, { fromBlock, toBlock })).filter(
      log => log.blockNumber! >= fromBlock && log.blockNumber! <= toBlock,
    );
    return logs.map(log => this.mapMessageSentLog(log));
  }

  /** Fetches MessageSent events for a specific message hash around a specific block. */
  async getMessageSentEventByHash(msgHash: Hex, aroundL1BlockNumber: bigint): Promise<MessageSentLog> {
    // We don't use blockHash here because we don't want the query to throw if the L1 block number no longer exists on chain
    // due to an L1 reorg. The use case for this method is usually checking if a message still exists on the Inbox after
    // a reorg, so it's possible the message was moved one block up or down, and that the original L1 block where we
    // saw it no longer exists, rendering the block-by-hash approach invalid.
    const [log] = await this.inbox.getEvents.MessageSent(
      { hash: msgHash },
      { fromBlock: maxBigint(aroundL1BlockNumber - 5n, 1n), toBlock: aroundL1BlockNumber + 5n },
    );
    if (!log) {
      return log as unknown as MessageSentLog;
    }
    return this.mapMessageSentLog(log);
  }

  private mapMessageSentLog(log: {
    blockNumber: bigint | null;
    blockHash: `0x${string}` | null;
    transactionHash: `0x${string}` | null;
    args: {
      hash?: `0x${string}`;
      inboxRollingHash?: `0x${string}`;
      bucketSeq?: bigint;
      message?: {
        sender: { actor: `0x${string}`; chainId: bigint };
        recipient: { actor: `0x${string}`; version: bigint };
        content: `0x${string}`;
        secretHash: `0x${string}`;
        index: bigint;
      };
    };
  }): MessageSentLog {
    const message = log.args.message!;
    return {
      l1BlockNumber: log.blockNumber!,
      l1BlockHash: Buffer32.fromString(log.blockHash!),
      l1TransactionHash: log.transactionHash!,
      args: {
        index: message.index,
        leaf: Fr.fromString(log.args.hash!),
        inboxRollingHash: Fr.fromString(log.args.inboxRollingHash!),
        bucketSeq: log.args.bucketSeq!,
        message: {
          sender: message.sender,
          recipient: { actor: Fr.fromString(message.recipient.actor), version: message.recipient.version },
          content: Fr.fromString(message.content),
          secretHash: Fr.fromString(message.secretHash),
          index: message.index,
        },
      },
    };
  }
}

/** The Inbox's live chain position, read atomically from the contract's getState. */
export type InboxContractState = {
  /** Consensus rolling hash after the most recently inserted message (zero when none was ever inserted). */
  rollingHash: Fr;
  /** Cumulative number of messages inserted into the Inbox. */
  totalMessagesInserted: bigint;
  /** Sequence number of the bucket currently accumulating messages. */
  currentBucketSeq: bigint;
};

function toInboxContractBucket(bucket: {
  rollingHash: Hex;
  totalMsgCount: bigint;
  timestamp: bigint;
  msgCount: number;
}): InboxContractBucket {
  return {
    rollingHash: Fr.fromString(bucket.rollingHash),
    totalMsgCount: bucket.totalMsgCount,
    timestamp: bucket.timestamp,
    msgCount: bucket.msgCount,
  };
}

/** A snapshot of an on-chain Inbox rolling-hash bucket. */
export type InboxContractBucket = {
  /** Consensus rolling hash (truncated sha256 chain) after the last message absorbed into this bucket. */
  rollingHash: Fr;
  /** Cumulative number of messages inserted into the Inbox up to and including this bucket. */
  totalMsgCount: bigint;
  /** L1 block timestamp at which this bucket was opened; its recency key, in seconds. */
  timestamp: bigint;
  /** Number of messages absorbed into this bucket. */
  msgCount: number;
};
