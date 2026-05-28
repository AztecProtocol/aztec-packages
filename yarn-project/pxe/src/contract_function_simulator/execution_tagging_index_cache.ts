import { AppTaggingSecret, type TaggingIndexRange } from '@aztec/stdlib/logs';

/** A map that stores the tagging index range for a given app tagging secret. */
export class ExecutionTaggingIndexCache {
  private taggingIndexMap: Map<string, { lowestIndex: number; highestIndex: number }> = new Map();

  public getLastUsedIndex(secret: AppTaggingSecret): number | undefined {
    return this.taggingIndexMap.get(secret.toString())?.highestIndex;
  }

  public setLastUsedIndex(secret: AppTaggingSecret, index: number) {
    const currentValue = this.taggingIndexMap.get(secret.toString());
    if (currentValue !== undefined && currentValue.highestIndex !== index - 1) {
      throw new Error(`Invalid tagging index update. Current value: ${currentValue.highestIndex}, new value: ${index}`);
    }
    if (currentValue !== undefined) {
      currentValue.highestIndex = index;
    } else {
      this.taggingIndexMap.set(secret.toString(), { lowestIndex: index, highestIndex: index });
    }
  }

  /**
   * Returns the tagging index ranges that were used in this execution (and that need to be stored in the db).
   */
  public getUsedTaggingIndexRanges(): TaggingIndexRange[] {
    return Array.from(this.taggingIndexMap.entries()).map(([secret, { lowestIndex, highestIndex }]) => ({
      extendedSecret: AppTaggingSecret.fromString(secret),
      lowestIndex,
      highestIndex,
    }));
  }
}
