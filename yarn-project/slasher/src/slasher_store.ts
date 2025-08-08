import { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { Offense, OffenseIdentifier, SlashPayload, SlashPayloadRound } from '@aztec/stdlib/slashing';

export const SCHEMA_VERSION = 1;

export class SlasherOffensesStore {
  constructor(private kvStore: AztecAsyncKVStore) {}

  public hasPendingOffense(offense: OffenseIdentifier): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  public getPendingOffenses(): Promise<Offense[]> {
    throw new Error('Method not implemented.');
  }

  public addPendingOffense(offense: Offense): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public hasOffense(pendingOffense: OffenseIdentifier): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  public removeFromPending(offenses: OffenseIdentifier[]): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public removeExpiredOffenses(round: bigint): Promise<void> {
    throw new Error('Method not implemented.');
  }

  /** Generate a unique key for an offense */
  private generateOffenseKey(offense: OffenseIdentifier): string {
    return `${offense.validator.toString()}-${offense.offense}-${offense.epochOrSlot}`;
  }
}

export class SlasherPayloadsStore {
  constructor(private kvStore: AztecAsyncKVStore) {}

  getPayloads(round: any): Promise<SlashPayloadRound[]> {
    throw new Error('Method not implemented.');
  }
  clearExpiredPayloads(round: bigint): Promise<void> {
    throw new Error('Method not implemented.');
  }
  incrementPayloadVotes(payloadAddress: EthAddress, round: bigint): Promise<bigint> {
    throw new Error('Method not implemented.');
  }

  addPayload(payload: SlashPayloadRound): Promise<void> {
    throw new Error('Method not implemented.');
  }

  getPayload(payloadAddress: EthAddress): Promise<SlashPayload | undefined> {
    throw new Error('Method not implemented.');
  }

  getPayloadRound(payloadAddress: EthAddress): Promise<SlashPayloadRound | undefined> {
    throw new Error('Method not implemented.');
  }

  hasPayload(payload: EthAddress): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
}
