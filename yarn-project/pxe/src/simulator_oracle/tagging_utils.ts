import { IndexedTaggingSecret } from '@aztec/circuits.js';

type SearchState = {
  currentTaggingSecrets: IndexedTaggingSecret[];
  maxIndexesToCheck: { [k: string]: number };
  initialSecretIndexes: { [k: string]: number };
  secretsToIncrement: { [k: string]: number };
};

export const INDEX_OFFSET = 10;

export function getInitialSearchState(appTaggingSecrets: IndexedTaggingSecret[]) {
  const searchState = appTaggingSecrets.reduce<SearchState>(
    (acc, appTaggingSecret) => ({
      // Start looking for logs before the stored index
      currentTaggingSecrets: acc.currentTaggingSecrets.concat([
        new IndexedTaggingSecret(appTaggingSecret.appTaggingSecret, Math.max(0, appTaggingSecret.index - INDEX_OFFSET)),
      ]),
      // Keep looking for logs beyond the stored index
      maxIndexesToCheck: {
        ...acc.maxIndexesToCheck,
        ...{ [appTaggingSecret.appTaggingSecret.toString()]: appTaggingSecret.index + INDEX_OFFSET },
      },
      // Keeps track of the secrets we have to increment in the database
      secretsToIncrement: {},
      // Store the initial set of indexes for the secrets
      initialSecretIndexes: {
        ...acc.initialSecretIndexes,
        ...{ [appTaggingSecret.appTaggingSecret.toString()]: appTaggingSecret.index },
      },
    }),
    { currentTaggingSecrets: [], maxIndexesToCheck: {}, secretsToIncrement: {}, initialSecretIndexes: {} },
  );

  return searchState;
}
