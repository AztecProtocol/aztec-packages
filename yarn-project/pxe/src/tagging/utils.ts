import type { DirectionalAppTaggingSecret, IndexedTaggingSecret } from '@aztec/stdlib/logs';

// TODO(benesjan): Make this return tags instead - this will moves some complexity from syncTaggedLogs
export function getIndexedTaggingSecretsForTheWindow(
  secretsAndWindows: { secret: DirectionalAppTaggingSecret; leftMostIndex: number; rightMostIndex: number }[],
): IndexedTaggingSecret[] {
  const secrets = [];
  for (const secretAndWindow of secretsAndWindows) {
    for (let i = secretAndWindow.leftMostIndex; i <= secretAndWindow.rightMostIndex; i++) {
      secrets.push({ secret: secretAndWindow.secret, index: i });
    }
  }
  return secrets;
}

/**
 * Creates a map from directional app tagging secret to initial index.
 * @param indexedTaggingSecrets - The indexed tagging secrets to get the initial indexes from.
 * @returns The map from directional app tagging secret to initial index.
 */
export function getInitialIndexesMap(indexedTaggingSecrets: IndexedTaggingSecret[]): {
  [k: string]: number;
} {
  const initialIndexes: { [k: string]: number } = {};

  for (const indexedTaggingSecret of indexedTaggingSecrets) {
    initialIndexes[indexedTaggingSecret.secret.toString()] = indexedTaggingSecret.index;
  }

  return initialIndexes;
}
