import { padArrayEnd } from '@aztec/foundation/collection';
import type { Serializable, Tuple } from '@aztec/foundation/serialize';
import { ClaimedLengthArray, ScopedKeyValidationRequestAndGenerator, ScopedReadRequest } from '@aztec/stdlib/kernel';

export function areDuplicateReadRequests(a: ScopedReadRequest, b: ScopedReadRequest): boolean {
  return a.value.equals(b.value) && a.contractAddress.equals(b.contractAddress);
}

export function areDuplicateKeyValidationRequests(
  a: ScopedKeyValidationRequestAndGenerator,
  b: ScopedKeyValidationRequestAndGenerator,
): boolean {
  return a.toBuffer().equals(b.toBuffer());
}

export function dedupClaimedLengthArray<T extends Serializable, N extends number>(
  original: ClaimedLengthArray<T, N>,
  areDuplicates: (a: T, b: T) => boolean,
  empty: T,
): ClaimedLengthArray<T, N> {
  const items = original.getActiveItems();
  const deduped: T[] = [];
  for (const item of items) {
    if (!deduped.some(d => areDuplicates(item, d))) {
      deduped.push(item);
    }
  }
  return new ClaimedLengthArray(padArrayEnd(deduped, empty, original.array.length) as Tuple<T, N>, deduped.length);
}
