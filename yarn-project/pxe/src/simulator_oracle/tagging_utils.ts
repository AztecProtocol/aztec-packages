import { IndexedTaggingSecret } from '@aztec/circuits.js';

// Half the size of the window we slide over the tagging secret indexes.
export const WINDOW_HALF_SIZE = 10;

export function getLeftMostIndexedTaggingSecrets(
  indexedTaggingSecrets: IndexedTaggingSecret[],
): IndexedTaggingSecret[] {
  return indexedTaggingSecrets.map(
    indexedTaggingSecret =>
      new IndexedTaggingSecret(
        indexedTaggingSecret.appTaggingSecret,
        Math.max(0, indexedTaggingSecret.index - WINDOW_HALF_SIZE),
      ),
  );
}

export function getRightMostIndexes(indexedTaggingSecrets: IndexedTaggingSecret[]): { [k: string]: number } {
  const rightMostIndexes: { [k: string]: number } = {};

  for (const indexedTaggingSecret of indexedTaggingSecrets) {
    rightMostIndexes[indexedTaggingSecret.appTaggingSecret.toString()] = indexedTaggingSecret.index + WINDOW_HALF_SIZE;
  }

  return rightMostIndexes;
}

export function getInitialIndexes(indexedTaggingSecrets: IndexedTaggingSecret[]): { [k: string]: number } {
  const initialIndexes: { [k: string]: number } = {};

  for (const indexedTaggingSecret of indexedTaggingSecrets) {
    initialIndexes[indexedTaggingSecret.appTaggingSecret.toString()] = indexedTaggingSecret.index;
  }

  return initialIndexes;
}
