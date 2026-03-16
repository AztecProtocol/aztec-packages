import { ExtendedDirectionalAppTaggingSecret, type TaggingIndexRange } from '@aztec/stdlib/logs';

/**
 * A map that stores the tagging index range for a given extended directional app tagging secret.
 * Note: The directional app tagging secret is unique for a (sender, recipient, contract) tuple while the direction
 * of sender -> recipient matters.
 */
export class ExecutionTaggingIndexCache {
  private taggingIndexMap: Map<string, { lowestIndex: number; highestIndex: number }> = new Map();

  public getLastUsedIndex(secret: ExtendedDirectionalAppTaggingSecret): number | undefined {
    return this.taggingIndexMap.get(secret.toString())?.highestIndex;
  }

  public setLastUsedIndex(secret: ExtendedDirectionalAppTaggingSecret, index: number) {
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
      extendedSecret: ExtendedDirectionalAppTaggingSecret.fromString(secret),
      lowestIndex,
      highestIndex,
    }));
  }
}
