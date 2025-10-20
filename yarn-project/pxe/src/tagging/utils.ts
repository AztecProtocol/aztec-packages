import type { DirectionalAppTaggingSecret, PreTag } from '@aztec/stdlib/logs';

// TODO(benesjan): Make this return tags instead - this will moves some complexity from syncTaggedLogs
export function getPreTagsForTheWindow(
  secretsAndWindows: { secret: DirectionalAppTaggingSecret; leftMostIndex: number; rightMostIndex: number }[],
): PreTag[] {
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
 * @param preTags - The pre tags to get the initial indexes map from.
 * @returns The map from directional app tagging secret to initial index.
 */
export function getInitialIndexesMap(preTags: { secret: DirectionalAppTaggingSecret; index: number | undefined }[]): {
  [k: string]: number;
} {
  const initialIndexes: { [k: string]: number } = {};

  for (const preTag of preTags) {
    initialIndexes[preTag.secret.toString()] = preTag.index ?? 0;
  }

  return initialIndexes;
}
