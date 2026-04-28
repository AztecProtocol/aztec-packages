import { createLogger } from '@aztec/aztec.js/log';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
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

  /** Multimap from round to offense keys */
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
  }

  /** Returns all offenses */
  public async getOffenses(): Promise<Offense[]> {
    const offenses: Offense[] = [];
    for await (const [, buffer] of this.offenses.entriesAsync()) {
      offenses.push(deserializeOffense(buffer));
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

  /** Returns whether we have seen this offense */
  public async hasOffense(offense: OffenseIdentifier): Promise<boolean> {
    const key = this.getOffenseKey(offense);
    return (await this.offenses.getAsync(key)) !== undefined;
  }

  /** Adds a new offense */
  public async addOffense(offense: Offense): Promise<void> {
    const key = this.getOffenseKey(offense);
    const round = getRoundForOffense(offense, this.settings);
    await this.kvStore.transactionAsync(async () => {
      await this.offenses.set(key, serializeOffense(offense));
      await this.roundsOffenses.set(this.getRoundKey(round), key);
    });
    this.log.trace(`Adding pending offense ${key} for round ${round}`);
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
