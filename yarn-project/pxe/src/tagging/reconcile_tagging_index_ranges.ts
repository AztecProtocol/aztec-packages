import { type AppTaggingSecret, SiloedTag, type TaggingIndexRange } from '@aztec/stdlib/logs';

/**
 * Reconciles tagging index ranges recorded by the PXE during private execution against the set of siloed tags whose
 * private logs survived to the final kernel output.
 *
 * Each input range is the contiguous `[lowestIndex, highestIndex]` set of indexes that the tagging index cache
 * reserved for a given tagging secret while a tx was being executed. The kernel may then squash some of those logs
 * (e.g. when a note is created and nullified within the same tx, taking its log with it), so the actual on-chain
 * footprint can be a strict subset of what was reserved.
 *
 * For each input range, this function shrinks `[lowestIndex, highestIndex]` so that both bounds correspond to indexes
 * that actually survived, trimming any dropped indices at the front or the back. It is possible that some interior
 * indexes were also dropped, leaving gaps between the lowest and highest indices, but we ignore those and accept the
 * resulting inefficiency rather than complicate the tagging model with one in which transactions may use interleaved
 * indices.
 *
 * Trimming tailing indices (e.g. `highestIndex`) is highly useful as it lets us reuse those indices in future
 * transactions. Trimming indices at the front (e.g. `lowestIndex`) is not as impactful since we will not ever use a
 * tagging index if a larger one exists (same as with gaps), but it does help in both making the consistency check
 * between database and transaction effects cheaper (as there's fewer logs to test) and making the database more
 * accurately reflect reality.
 *
 * Ranges with no surviving indexes are dropped from the output entirely.
 *
 * Example scenario:
 *   - used indexes 3 to 7, kerel squashed indexes 3, 5, and 7:
 *      - range: [3, 7]
 *      - survived: set(3, 5, 7)
 *      - output: [4, 6]  (trimmed from both ends, gap at 5 is tolerated)
 *
 * @param ranges - The tagging index ranges as recorded during private execution (pre-squash).
 * @param survivingTags - The set of siloed tag values (as strings) of private logs that survived kernel squashing.
 * @returns The reconciled ranges, with bounds tightened to surviving indexes and fully-squashed ranges removed.
 */
export async function reconcileTaggingIndexRangesAgainstSurvivingTags(
  ranges: TaggingIndexRange[],
  survivingTags: Set<string>,
): Promise<TaggingIndexRange[]> {
  const reconciled: TaggingIndexRange[] = [];

  for (const range of ranges) {
    const newLowestIndex = await findFirstSurvivingIndex(
      range.extendedSecret,
      range.lowestIndex,
      range.highestIndex,
      survivingTags,
    );
    if (newLowestIndex === undefined) {
      // No index in this range corresponds to a surviving log: the entire range was squashed.
      continue;
    }

    // newLowestIndex is itself a survivor, so the backward scan is guaranteed to find at least that index.
    const newHighestIndex = await findLastSurvivingIndex(
      range.extendedSecret,
      newLowestIndex,
      range.highestIndex,
      survivingTags,
    );

    reconciled.push({
      extendedSecret: range.extendedSecret,
      lowestIndex: newLowestIndex,
      highestIndex: newHighestIndex!,
    });
  }

  return reconciled;
}

/** Scans `[start, end]` ascending and returns the first index whose siloed tag is in `survivingTags`. */
async function findFirstSurvivingIndex(
  secret: AppTaggingSecret,
  start: number,
  end: number,
  survivingTags: Set<string>,
): Promise<number | undefined> {
  for (let index = start; index <= end; index++) {
    const tag = await SiloedTag.compute({ extendedSecret: secret, index });
    if (survivingTags.has(tag.value.toString())) {
      return index;
    }
  }
  return undefined;
}

/** Scans `[start, end]` descending and returns the first index whose siloed tag is in `survivingTags`. */
async function findLastSurvivingIndex(
  secret: AppTaggingSecret,
  start: number,
  end: number,
  survivingTags: Set<string>,
): Promise<number | undefined> {
  for (let index = end; index >= start; index--) {
    const tag = await SiloedTag.compute({ extendedSecret: secret, index });
    if (survivingTags.has(tag.value.toString())) {
      return index;
    }
  }
  return undefined;
}
