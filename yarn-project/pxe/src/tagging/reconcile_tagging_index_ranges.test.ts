import { type AppTaggingSecret, AppTaggingSecretKind, SiloedTag } from '@aztec/stdlib/logs';
import { randomAppTaggingSecret } from '@aztec/stdlib/testing';

import { reconcileTaggingIndexRangesAgainstSurvivingTags } from './reconcile_tagging_index_ranges.js';

describe('reconcileTaggingIndexRangesAgainstSurvivingTags', () => {
  let secret1: AppTaggingSecret;
  let secret2: AppTaggingSecret;

  beforeAll(async () => {
    secret1 = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
    secret2 = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
  });

  /** Builds a set of surviving siloed tag values from a list of `(secret, index)` pairs. */
  async function buildSurvivingTags(pairs: Array<{ secret: AppTaggingSecret; index: number }>): Promise<Set<string>> {
    const tags = await Promise.all(
      pairs.map(({ secret, index }) => SiloedTag.compute({ extendedSecret: secret, index })),
    );
    return new Set(tags.map(t => t.value.toString()));
  }

  it('returns empty when given no ranges', async () => {
    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags([], new Set());
    expect(reconciled).toEqual([]);
  });

  it('drops a range when no surviving tags are provided', async () => {
    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [{ extendedSecret: secret1, lowestIndex: 1, highestIndex: 3 }],
      new Set(),
    );
    expect(reconciled).toEqual([]);
  });

  it('leaves the range unchanged when every index survives', async () => {
    const survivingTags = await buildSurvivingTags([
      { secret: secret1, index: 1 },
      { secret: secret1, index: 2 },
      { secret: secret1, index: 3 },
    ]);

    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [{ extendedSecret: secret1, lowestIndex: 1, highestIndex: 3 }],
      survivingTags,
    );

    expect(reconciled).toEqual([{ extendedSecret: secret1, lowestIndex: 1, highestIndex: 3 }]);
  });

  it('lowers `highestIndex` when trailing indexes are squashed', async () => {
    const survivingTags = await buildSurvivingTags([
      { secret: secret1, index: 1 },
      { secret: secret1, index: 2 },
    ]);

    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [{ extendedSecret: secret1, lowestIndex: 1, highestIndex: 5 }],
      survivingTags,
    );

    expect(reconciled).toEqual([{ extendedSecret: secret1, lowestIndex: 1, highestIndex: 2 }]);
  });

  it('raises `lowestIndex` when leading indexes are squashed', async () => {
    const survivingTags = await buildSurvivingTags([
      { secret: secret1, index: 4 },
      { secret: secret1, index: 5 },
    ]);

    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [{ extendedSecret: secret1, lowestIndex: 1, highestIndex: 5 }],
      survivingTags,
    );

    expect(reconciled).toEqual([{ extendedSecret: secret1, lowestIndex: 4, highestIndex: 5 }]);
  });

  it('shrinks both bounds when leading and trailing indexes are squashed', async () => {
    const survivingTags = await buildSurvivingTags([
      { secret: secret1, index: 3 },
      { secret: secret1, index: 4 },
    ]);

    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [{ extendedSecret: secret1, lowestIndex: 1, highestIndex: 6 }],
      survivingTags,
    );

    expect(reconciled).toEqual([{ extendedSecret: secret1, lowestIndex: 3, highestIndex: 4 }]);
  });

  it('keeps the original bounds when only interior indexes are squashed', async () => {
    const survivingTags = await buildSurvivingTags([
      { secret: secret1, index: 1 },
      { secret: secret1, index: 5 },
    ]);

    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [{ extendedSecret: secret1, lowestIndex: 1, highestIndex: 5 }],
      survivingTags,
    );

    expect(reconciled).toEqual([{ extendedSecret: secret1, lowestIndex: 1, highestIndex: 5 }]);
  });

  it('collapses to a single-index range when only one interior index survives', async () => {
    const survivingTags = await buildSurvivingTags([{ secret: secret1, index: 3 }]);

    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [{ extendedSecret: secret1, lowestIndex: 1, highestIndex: 5 }],
      survivingTags,
    );

    expect(reconciled).toEqual([{ extendedSecret: secret1, lowestIndex: 3, highestIndex: 3 }]);
  });

  it('drops a fully-squashed range while keeping unrelated ranges that survive', async () => {
    const survivingTags = await buildSurvivingTags([
      { secret: secret2, index: 1 },
      { secret: secret2, index: 2 },
    ]);

    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [
        { extendedSecret: secret1, lowestIndex: 1, highestIndex: 3 },
        { extendedSecret: secret2, lowestIndex: 1, highestIndex: 2 },
      ],
      survivingTags,
    );

    expect(reconciled).toEqual([{ extendedSecret: secret2, lowestIndex: 1, highestIndex: 2 }]);
  });

  it('reconciles each range independently when multiple secrets are provided', async () => {
    const survivingTags = await buildSurvivingTags([
      { secret: secret1, index: 2 },
      { secret: secret1, index: 3 },
      { secret: secret2, index: 5 },
    ]);

    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [
        { extendedSecret: secret1, lowestIndex: 1, highestIndex: 4 },
        { extendedSecret: secret2, lowestIndex: 4, highestIndex: 6 },
      ],
      survivingTags,
    );

    expect(reconciled).toEqual([
      { extendedSecret: secret1, lowestIndex: 2, highestIndex: 3 },
      { extendedSecret: secret2, lowestIndex: 5, highestIndex: 5 },
    ]);
  });

  it('keeps a single-index range when its index survives', async () => {
    const survivingTags = await buildSurvivingTags([{ secret: secret1, index: 7 }]);

    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [{ extendedSecret: secret1, lowestIndex: 7, highestIndex: 7 }],
      survivingTags,
    );

    expect(reconciled).toEqual([{ extendedSecret: secret1, lowestIndex: 7, highestIndex: 7 }]);
  });

  it('drops a single-index range when its index is squashed', async () => {
    const survivingTags = await buildSurvivingTags([{ secret: secret2, index: 7 }]);

    const reconciled = await reconcileTaggingIndexRangesAgainstSurvivingTags(
      [{ extendedSecret: secret1, lowestIndex: 7, highestIndex: 7 }],
      survivingTags,
    );

    expect(reconciled).toEqual([]);
  });
});
