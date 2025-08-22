import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSet } from '@aztec/kv-store';
import {
  type Offense,
  type OffenseIdentifier,
  deserializeOffense,
  getRoundForOffense,
  serializeOffense,
} from '@aztec/stdlib/slashing';

export const SCHEMA_VERSION = 1;

export class SlasherOffensesStore {
  /** Map from offense key to offense data */
  private offenses: AztecAsyncMap<string, Buffer>;

  /** Map from offense key to whether the offense has been executed (only used for empire based slashing) */
  private offensesSlashed: AztecAsyncSet<string>;

  /** Multimap from round to offense keys (only used for consensus based slashing) */
  private roundsOffenses: AztecAsyncMultiMap<string, string>;

  constructor(
    private kvStore: AztecAsyncKVStore,
    private settings: {
      slashingRoundSize: number;
      epochDuration: number;
    },
  ) {
    this.offenses = kvStore.openMap('offenses');
    this.roundsOffenses = kvStore.openMultiMap('rounds-offenses');
    this.offensesSlashed = kvStore.openSet('offenses-slashed');
  }

  /** Returns all offenses not marked as slashed */
  public async getPendingOffenses(): Promise<Offense[]> {
    const offenses: Offense[] = [];
    for await (const [key, buffer] of this.offenses.entriesAsync()) {
      if (await this.offensesSlashed.hasAsync(key)) {
        continue; // Skip executed offenses
      }
      const offense = deserializeOffense(buffer);
      offenses.push(offense);
    }
    return offenses;
  }

  /** Returns all offenses tracked for the given round */
  public async getOffensesForRound(round: bigint): Promise<Offense[]> {
    const offenses: Offense[] = [];
    for await (const key of this.roundsOffenses.getValuesAsync(round.toString())) {
      const buffer = await this.offenses.getAsync(key);
      if (buffer) {
        const offense = deserializeOffense(buffer);
        offenses.push(offense);
      }
    }
    return offenses;
  }

  /** Returns whether an offense is pending (ie not marked as slashed) */
  public async hasPendingOffense(offense: OffenseIdentifier): Promise<boolean> {
    const key = this.getOffenseKey(offense);
    return (await this.offenses.getAsync(key)) !== undefined && !(await this.offensesSlashed.hasAsync(key));
  }

  /** Returns whether we have seen this offense */
  public async hasOffense(offense: OffenseIdentifier): Promise<boolean> {
    const key = this.getOffenseKey(offense);
    return (await this.offenses.getAsync(key)) !== undefined;
  }

  /** Adds a new offense (defaults to pending, but will be slashed if markAsSlashed had been called for it) */
  public async addPendingOffense(offense: Offense): Promise<void> {
    const key = this.getOffenseKey(offense);
    await this.offenses.set(key, serializeOffense(offense));
    const round = getRoundForOffense(offense, this.settings);
    await this.roundsOffenses.set(round.toString(), key);
  }

  /** Marks the given offenses as slashed (regardless of whether they are known or not)  */
  public async markAsSlashed(offenses: OffenseIdentifier[]): Promise<void> {
    await this.kvStore.transactionAsync(async () => {
      for (const offense of offenses) {
        const key = this.getOffenseKey(offense);
        await this.offensesSlashed.add(key);
      }
    });
  }

  public async clearExpiredOffenses(_currentRound: bigint): Promise<void> {
    // TODO(palla/slash): Implement expiration logic
  }

  /** Generate a unique key for an offense */
  private getOffenseKey(offense: OffenseIdentifier): string {
    return `${offense.validator.toString()}:${offense.offenseType}:${offense.epochOrSlot}`;
  }
}
