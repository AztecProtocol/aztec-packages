import { DirectionalAppTaggingSecret, type IndexedTaggingSecret } from '@aztec/stdlib/logs';

/**
 * A map that stores the tagging index for a given directional app tagging secret.
 * Note: The directional app tagging secret is unique for a (sender, recipient, contract) tuple while the direction
 * of sender -> recipient matters.
 */
export class ExecutionTaggingIndexCache {
  private taggingIndexMap: Map<string, number> = new Map();

  public getLastUsedIndex(secret: DirectionalAppTaggingSecret): number | undefined {
    return this.taggingIndexMap.get(secret.toString());
  }

  public setLastUsedIndex(secret: DirectionalAppTaggingSecret, index: number) {
    const currentValue = this.taggingIndexMap.get(secret.toString());
    if (currentValue !== undefined && currentValue !== index - 1) {
      throw new Error(`Invalid tagging index update. Current value: ${currentValue}, new value: ${index}`);
    }
    this.taggingIndexMap.set(secret.toString(), index);
  }

  /**
   * Returns the indexed tagging secrets that were used in this execution.
   */
  public getUsedIndexedTaggingSecrets(): IndexedTaggingSecret[] {
    return Array.from(this.taggingIndexMap.entries()).map(([secret, index]) => ({
      secret: DirectionalAppTaggingSecret.fromString(secret),
      index,
    }));
  }
}
