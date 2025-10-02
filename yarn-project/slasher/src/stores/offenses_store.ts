import { createLogger } from '@aztec/aztec.js';
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

  private log = createLogger('slasher:store:offenses');

  constructor(
    private kvStore: AztecAsyncKVStore,
    private settings: {
      slashingRoundSize: number;
      epochDuration: number;
      slashOffenseExpirationRounds?: number;
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
    for await (const key of this.roundsOffenses.getValuesAsync(this.getRoundKey(round))) {
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
    await this.roundsOffenses.set(this.getRoundKey(round), key);
    this.log.trace(`Adding pending offense ${key} for round ${round}`);
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

  /** Prunes all offenses expired from the store */
  public async clearExpiredOffenses(currentRound: bigint): Promise<number> {
    const expirationRounds = this.settings.slashOffenseExpirationRounds ?? 0;
    if (expirationRounds <= 0) {
      return 0; // No expiration configured
    }

    const expiredBefore = currentRound - BigInt(expirationRounds);
    if (expiredBefore < 0) {
      return 0; // Not enough rounds have passed to expire anything
    }

    // Collect expired offenses and rounds
    const expiredRoundKeys = new Set<string>();
    const expiredOffenseKeys = new Set<string>();
    for await (const [roundKey, offenseKey] of this.roundsOffenses.entriesAsync({
      end: this.getRoundKey(expiredBefore),
    })) {
      expiredOffenseKeys.add(offenseKey);
      expiredRoundKeys.add(roundKey);
    }

    if (expiredOffenseKeys.size === 0 && expiredRoundKeys.size === 0) {
      return 0; // Nothing to clean up
    }

    // Remove expired stuff in a transaction
    await this.kvStore.transactionAsync(async () => {
      for (const key of expiredOffenseKeys) {
        this.log.trace(`Deleting offense ${key}`);
        await this.offenses.delete(key);
        await this.offensesSlashed.delete(key);
      }
      for (const roundKey of expiredRoundKeys) {
        this.log.trace(`Deleting round info for ${roundKey}`);
        await this.roundsOffenses.delete(roundKey);
      }
    });

    return expiredOffenseKeys.size;
  }

  /** Generate a unique key for an offense */
  private getOffenseKey(offense: OffenseIdentifier): string {
    return `${offense.validator.toString()}:${offense.offenseType}:${offense.epochOrSlot}`;
  }

  private getRoundKey(round: bigint): string {
    return round.toString().padStart(16, '0');
  }
}
