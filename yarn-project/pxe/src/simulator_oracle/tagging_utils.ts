import { IndexedTaggingSecret } from '@aztec/circuits.js';

/**
 * Gets indexed tagging secrets with leftmost indexes.
 * @param indexedTaggingSecrets - The indexed tagging secrets to get the leftmost indexed tagging secrets from.
 * @param windowHalfSize- The half size of the window to slide over the tagging secret indexes.
 * @returns The leftmost indexed tagging secrets.
 */
export function getLeftMostIndexedTaggingSecrets(
  indexedTaggingSecrets: IndexedTaggingSecret[],
  windowHalfSize: number,
): IndexedTaggingSecret[] {
  return indexedTaggingSecrets.map(
    indexedTaggingSecret =>
      new IndexedTaggingSecret(
        indexedTaggingSecret.appTaggingSecret,
        Math.max(0, indexedTaggingSecret.index - windowHalfSize),
      ),
  );
}

/**
 * Creates a map from app tagging secret to rightmost index.
 * @param indexedTaggingSecrets - The indexed tagging secrets to get the rightmost indexes from.
 * @param windowHalfSize- The half size of the window to slide over the tagging secret indexes.
 * @returns The map from app tagging secret to rightmost index.
 */
export function getRightMostIndexes(
  indexedTaggingSecrets: IndexedTaggingSecret[],
  windowHalfSize: number,
): { [k: string]: number } {
  const rightMostIndexes: { [k: string]: number } = {};

  for (const indexedTaggingSecret of indexedTaggingSecrets) {
    rightMostIndexes[indexedTaggingSecret.appTaggingSecret.toString()] = indexedTaggingSecret.index + windowHalfSize;
  }

  return rightMostIndexes;
}

/**
 * Creates a map from app tagging secret to initial index.
 * @param indexedTaggingSecrets - The indexed tagging secrets to get the initial indexes from.
 * @returns The map from app tagging secret to initial index.
 */
export function getInitialIndexes(indexedTaggingSecrets: IndexedTaggingSecret[]): { [k: string]: number } {
  const initialIndexes: { [k: string]: number } = {};

  for (const indexedTaggingSecret of indexedTaggingSecrets) {
    initialIndexes[indexedTaggingSecret.appTaggingSecret.toString()] = indexedTaggingSecret.index;
  }

  return initialIndexes;
}
