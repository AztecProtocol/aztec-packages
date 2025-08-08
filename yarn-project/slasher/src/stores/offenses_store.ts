import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSet } from '@aztec/kv-store';
import {
  type Offense,
  type OffenseIdentifier,
  deserializeOffense,
  getFirstRoundForOffense,
  serializeOffense,
} from '@aztec/stdlib/slashing';

export const SCHEMA_VERSION = 1;

export class SlasherOffensesStore {
  /** Map from offense key to offense data */
  private offenses: AztecAsyncMap<string, Buffer>;

  /** Map from offense key to whether the offense has been executed */
  private offensesSlashed: AztecAsyncSet<string>;

  /** Map from first eligible round to offense keys */
  private roundsOffenses: AztecAsyncMultiMap<string, string>;

  constructor(
    private kvStore: AztecAsyncKVStore,
    private settings: {
      slashingRoundSize: bigint;
      epochDuration: number;
      proofSubmissionEpochs: number;
    },
  ) {
    this.offenses = kvStore.openMap('offenses');
    this.roundsOffenses = kvStore.openMultiMap('rounds-offenses');
    this.offensesSlashed = kvStore.openSet('offenses-slashed');
  }

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

  public async hasPendingOffense(offense: OffenseIdentifier): Promise<boolean> {
    const key = this.getOffenseKey(offense);
    return (await this.offenses.getAsync(key)) !== undefined && !(await this.offensesSlashed.hasAsync(key));
  }

  public async hasOffense(offense: OffenseIdentifier): Promise<boolean> {
    const key = this.getOffenseKey(offense);
    return (await this.offenses.getAsync(key)) !== undefined;
  }

  public async addPendingOffense(offense: Offense): Promise<void> {
    const key = this.getOffenseKey(offense);
    await this.offenses.set(key, serializeOffense(offense));
    const round = getFirstRoundForOffense(offense, this.settings);
    await this.roundsOffenses.set(round.toString(), key);
  }

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
