import { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import {
  type SlashPayload,
  type SlashPayloadRound,
  deserializeSlashPayload,
  serializeSlashPayload,
} from '@aztec/stdlib/slashing';

export class SlasherPayloadsStore {
  /** Map from payload address to payload data */
  private payloads: AztecAsyncMap<string, Buffer>;

  /** Map from `round:payload` to votes */
  private roundPayloadVotes: AztecAsyncMap<string, bigint>;

  constructor(private kvStore: AztecAsyncKVStore) {
    this.payloads = kvStore.openMap('slash-payloads');
    this.roundPayloadVotes = kvStore.openMap('round-payload-votes');
  }

  public async getPayloadsForRound(round: bigint): Promise<SlashPayloadRound[]> {
    const payloads: SlashPayloadRound[] = [];
    const votes = await this.getVotesForRound(round);
    for (const [address, votesCount] of votes) {
      const payload = await this.getPayload(address);
      if (payload) {
        payloads.push({ ...payload, votes: votesCount, round });
      }
    }
    return payloads;
  }

  public async getPayloadAtRound(payloadAddress: EthAddress, round: bigint): Promise<SlashPayloadRound | undefined> {
    const address = payloadAddress.toString();
    const buffer = await this.payloads.getAsync(address);
    if (!buffer) {
      return undefined;
    }

    const data = deserializeSlashPayload(buffer);
    const votes = (await this.roundPayloadVotes.getAsync(this.getPayloadVotesKey(round, address))) ?? 0n;

    return { ...data, votes, round };
  }

  private async getVotesForRound(round: bigint): Promise<[string, bigint][]> {
    const votes: [string, bigint][] = [];
    const roundPrefix = `${round.toString()}:`;
    for await (const [fullKey, roundVotes] of this.roundPayloadVotes.entriesAsync(
      this.getPayloadVotesKeyRangeForRound(round),
    )) {
      // Extract just the address part from the key (remove "round:" prefix)
      const address = fullKey.substring(roundPrefix.length);
      votes.push([address, roundVotes]);
    }
    return votes;
  }

  private getPayloadVotesKey(round: bigint, payloadAddress: EthAddress | string): string {
    return `${round.toString()}:${payloadAddress.toString()}`;
  }

  private getPayloadVotesKeyRangeForRound(round: bigint): { start: string; end: string } {
    const start = `${round.toString()}:`;
    const end = `${round.toString()}:Z`; // 'Z' sorts after any hex address, 0x-prefixed or not
    return { start, end };
  }

  public async clearExpiredPayloads(_currentRound: bigint): Promise<void> {
    // TODO(palla/slash): Implement me!
  }

  public async incrementPayloadVotes(payloadAddress: EthAddress, round: bigint): Promise<bigint> {
    const key = this.getPayloadVotesKey(round, payloadAddress);
    const currentVotes = (await this.roundPayloadVotes.getAsync(key)) || 0n;
    const newVotes = currentVotes + 1n;
    await this.roundPayloadVotes.set(key, newVotes);
    return newVotes;
  }

  public async addPayload(payload: SlashPayloadRound): Promise<void> {
    const address = payload.address.toString();

    await this.kvStore.transactionAsync(async () => {
      await this.payloads.set(address, serializeSlashPayload(payload));
      await this.roundPayloadVotes.set(this.getPayloadVotesKey(payload.round, address), payload.votes);
    });
  }

  public async getPayload(payloadAddress: EthAddress | string): Promise<SlashPayload | undefined> {
    const address = payloadAddress.toString();
    const buffer = await this.payloads.getAsync(address);
    return buffer ? deserializeSlashPayload(buffer) : undefined;
  }

  public async hasPayload(payload: EthAddress): Promise<boolean> {
    const address = payload.toString();
    return (await this.payloads.getAsync(address)) !== undefined;
  }
}
