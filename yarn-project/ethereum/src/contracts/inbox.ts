import { asyncPool } from '@aztec/foundation/async-pool';
import { maxBigint } from '@aztec/foundation/bigint';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { InboxAbi } from '@aztec/l1-artifacts/InboxAbi';

import { type BlockTag, type GetContractReturnType, type Hex, getContract } from 'viem';

import { getPublicClient } from '../client.js';
import type { DeployAztecL1ContractsReturnType } from '../deploy_aztec_l1_contracts.js';
import type { L1ReaderConfig } from '../l1_reader.js';
import type { ViemClient } from '../types.js';
import type { L1EventLog } from './log.js';
import { checkBlockTag } from './utils.js';

/** Arguments for the MessageSent event. */
export type MessageSentArgs = {
  index: bigint;
  leaf: Fr;
  checkpointNumber: CheckpointNumber;
  rollingHash: Buffer16;
  /** Consensus rolling hash (truncated sha256 chain) after this message (AZIP-22 Fast Inbox). Not yet consumed by the node. */
  inboxRollingHash: Fr;
  /** Sequence number of the Inbox bucket this message was absorbed into (AZIP-22 Fast Inbox). Not yet consumed by the node. */
  bucketSeq: bigint;
};

/** Log type for MessageSent events, enriched with the emitting L1 block's timestamp (the bucket recency key). */
export type MessageSentLog = L1EventLog<MessageSentArgs> & {
  /** Timestamp (in seconds) of the L1 block that emitted the event; the key of the message's Inbox bucket. */
  l1BlockTimestamp: bigint;
};

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

  public async getLag(opts: { blockTag?: BlockTag; blockNumber?: bigint } = {}): Promise<bigint> {
    await checkBlockTag(opts.blockNumber, this.client);
    return await this.inbox.read.LAG(opts);
  }

  public async getState(opts: { blockTag?: BlockTag; blockNumber?: bigint } = {}): Promise<InboxContractState> {
    await checkBlockTag(opts.blockNumber, this.client);
    const state = await this.inbox.read.getState(opts);
    return {
      totalMessagesInserted: state.totalMessagesInserted,
      messagesRollingHash: Buffer16.fromString(state.rollingHash),
      treeInProgress: state.inProgress,
    };
  }

  /** Fetches MessageSent events within the given block range. */
  async getMessageSentEvents(fromBlock: bigint, toBlock: bigint): Promise<MessageSentLog[]> {
    const logs = (await this.inbox.getEvents.MessageSent({}, { fromBlock, toBlock })).filter(
      log => log.blockNumber! >= fromBlock && log.blockNumber! <= toBlock,
    );
    const timestamps = await this.getBlockTimestamps(logs.map(log => log.blockNumber!));
    return logs.map(log => this.mapMessageSentLog(log, timestamps.get(log.blockNumber!)!));
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
    const [timestamp] = (await this.getBlockTimestamps([log.blockNumber!])).values();
    return this.mapMessageSentLog(log, timestamp);
  }

  /**
   * Fetches the timestamp of each distinct L1 block number, so each MessageSent log can carry its bucket key.
   * Fetched with bounded concurrency to keep a large sync batch from fanning out unbounded RPC requests. Blocks
   * are resolved by number rather than hash so a concurrent L1 reorg does not throw; a resulting cross-fork
   * timestamp is transient and re-corrected by the archiver's rolling-hash reorg detection on the next sync.
   */
  private async getBlockTimestamps(blockNumbers: bigint[]): Promise<Map<bigint, bigint>> {
    const uniqueBlockNumbers = [...new Set(blockNumbers)];
    const timestamps = new Map<bigint, bigint>();
    await asyncPool(10, uniqueBlockNumbers, async blockNumber => {
      const block = await this.client.getBlock({ blockNumber, includeTransactions: false });
      timestamps.set(blockNumber, block.timestamp);
    });
    return timestamps;
  }

  private mapMessageSentLog(
    log: {
      blockNumber: bigint | null;
      blockHash: `0x${string}` | null;
      transactionHash: `0x${string}` | null;
      args: {
        index?: bigint;
        hash?: `0x${string}`;
        checkpointNumber?: bigint;
        rollingHash?: `0x${string}`;
        inboxRollingHash?: `0x${string}`;
        bucketSeq?: bigint;
      };
    },
    l1BlockTimestamp: bigint,
  ): MessageSentLog {
    return {
      l1BlockNumber: log.blockNumber!,
      l1BlockHash: Buffer32.fromString(log.blockHash!),
      l1TransactionHash: log.transactionHash!,
      l1BlockTimestamp,
      args: {
        index: log.args.index!,
        leaf: Fr.fromString(log.args.hash!),
        checkpointNumber: CheckpointNumber.fromBigInt(log.args.checkpointNumber!),
        rollingHash: Buffer16.fromString(log.args.rollingHash!),
        inboxRollingHash: Fr.fromString(log.args.inboxRollingHash!),
        bucketSeq: log.args.bucketSeq!,
      },
    };
  }
}

export type InboxContractState = {
  totalMessagesInserted: bigint;
  messagesRollingHash: Buffer16;
  treeInProgress: bigint;
};
