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
    const address = config.l1Contracts.inboxAddress.toString();
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
    const logs = await this.inbox.getEvents.MessageSent({}, { fromBlock, toBlock });
    return logs
      .filter(log => log.blockNumber! >= fromBlock && log.blockNumber! <= toBlock)
      .map(log => this.mapMessageSentLog(log));
  }

  /** Fetches MessageSent events for a specific message hash within the given block range. */
  async getMessageSentEventByHash(hash: Hex, fromBlock: bigint, toBlock: bigint): Promise<MessageSentLog[]> {
    const logs = await this.inbox.getEvents.MessageSent({ hash }, { fromBlock, toBlock });
    return logs.map(log => this.mapMessageSentLog(log));
  }

  private mapMessageSentLog(log: {
    blockNumber: bigint | null;
    blockHash: `0x${string}` | null;
    transactionHash: `0x${string}` | null;
    args: { index?: bigint; hash?: `0x${string}`; checkpointNumber?: bigint; rollingHash?: `0x${string}` };
  }): MessageSentLog {
    return {
      l1BlockNumber: log.blockNumber!,
      l1BlockHash: Buffer32.fromString(log.blockHash!),
      l1TransactionHash: log.transactionHash!,
      args: {
        index: log.args.index!,
        leaf: Fr.fromString(log.args.hash!),
        checkpointNumber: CheckpointNumber.fromBigInt(log.args.checkpointNumber!),
        rollingHash: Buffer16.fromString(log.args.rollingHash!),
      },
    };
  }
}

export type InboxContractState = {
  totalMessagesInserted: bigint;
  messagesRollingHash: Buffer16;
  treeInProgress: bigint;
};
