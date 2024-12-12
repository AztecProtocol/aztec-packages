import { IndexedTaggingSecret } from '@aztec/circuits.js';

export const WINDOW_HALF_SIZE = 10;

export function getLeftMostIndexedTaggingSecrets(indexedTaggingSecrets: IndexedTaggingSecret[]): IndexedTaggingSecret[] {
  return indexedTaggingSecrets.map(indexedTaggingSecret =>
    new IndexedTaggingSecret(
      indexedTaggingSecret.appTaggingSecret,
      Math.max(0, indexedTaggingSecret.index - WINDOW_HALF_SIZE)
    )
  );
}

export function getRightMostIndexes(indexedTaggingSecrets: IndexedTaggingSecret[]): { [k: string]: number } {
  const maxIndexesToCheck: { [k: string]: number } = {};

  for (const indexedTaggingSecret of indexedTaggingSecrets) {
    maxIndexesToCheck[indexedTaggingSecret.appTaggingSecret.toString()] = indexedTaggingSecret.index + WINDOW_HALF_SIZE;
  }

  return maxIndexesToCheck;
}

export function getInitialSecretIndexes(indexedTaggingSecrets: IndexedTaggingSecret[]): { [k: string]: number } {
  const initialSecretIndexes: { [k: string]: number } = {};

  for (const indexedTaggingSecret of indexedTaggingSecrets) {
    initialSecretIndexes[indexedTaggingSecret.appTaggingSecret.toString()] = indexedTaggingSecret.index;
  }

  return initialSecretIndexes;
}