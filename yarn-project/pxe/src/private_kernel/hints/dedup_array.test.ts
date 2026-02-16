import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  ClaimedLengthArray,
  KeyValidationRequest,
  KeyValidationRequestAndGenerator,
  ReadRequest,
  ScopedKeyValidationRequestAndGenerator,
  ScopedReadRequest,
} from '@aztec/stdlib/kernel';

import { areDuplicateKeyValidationRequests, areDuplicateReadRequests, dedupClaimedLengthArray } from './dedup_array.js';

describe('areDuplicateReadRequests', () => {
  const makeRequest = ({
    value = new Fr(12),
    counter = 345,
    contractAddress = AztecAddress.fromBigInt(6789n),
  }: { value?: Fr; counter?: number; contractAddress?: AztecAddress } = {}) =>
    new ScopedReadRequest(new ReadRequest(value, counter), contractAddress);

  it('returns true for identical requests', () => {
    const a = makeRequest();
    const b = makeRequest();
    expect(areDuplicateReadRequests(a, b)).toBe(true);
  });

  it('ignores counter differences', () => {
    const a = makeRequest({ counter: 100 });
    const b = makeRequest({ counter: 999 });
    expect(areDuplicateReadRequests(a, b)).toBe(true);
  });

  it('returns false for different values', () => {
    const a = makeRequest({ value: new Fr(1) });
    const b = makeRequest({ value: new Fr(2) });
    expect(areDuplicateReadRequests(a, b)).toBe(false);
  });

  it('returns false for different contractAddresses', () => {
    const a = makeRequest({ contractAddress: AztecAddress.fromBigInt(1n) });
    const b = makeRequest({ contractAddress: AztecAddress.fromBigInt(2n) });
    expect(areDuplicateReadRequests(a, b)).toBe(false);
  });
});

describe('areDuplicateKeyValidationRequests', () => {
  const makeRequest = ({
    pkM = Point.fromFields([new Fr(12), new Fr(34), Fr.ZERO]),
    skApp = new Fr(56),
    generator = new Fr(78),
    address = AztecAddress.fromBigInt(90n),
  }: { pkM?: Point; skApp?: Fr; generator?: Fr; address?: AztecAddress } = {}) =>
    new ScopedKeyValidationRequestAndGenerator(
      new KeyValidationRequestAndGenerator(new KeyValidationRequest(pkM, skApp), generator),
      address,
    );

  it('returns true for identical requests', () => {
    const a = makeRequest();
    const b = makeRequest();
    expect(areDuplicateKeyValidationRequests(a, b)).toBe(true);
  });

  it('returns false when skApp differs', () => {
    const a = makeRequest({ skApp: new Fr(1) });
    const b = makeRequest({ skApp: new Fr(2) });
    expect(areDuplicateKeyValidationRequests(a, b)).toBe(false);
  });

  it('returns false when generator differs', () => {
    const a = makeRequest({ generator: new Fr(1) });
    const b = makeRequest({ generator: new Fr(2) });
    expect(areDuplicateKeyValidationRequests(a, b)).toBe(false);
  });

  it('returns false when contractAddress differs', () => {
    const a = makeRequest({ address: AztecAddress.fromBigInt(1n) });
    const b = makeRequest({ address: AztecAddress.fromBigInt(2n) });
    expect(areDuplicateKeyValidationRequests(a, b)).toBe(false);
  });
});

describe('dedupClaimedLengthArray', () => {
  const MAX = 8;
  const address = AztecAddress.fromBigInt(42n);

  const makeRequests = (requestValues: (number | { value: number; counter: number })[]) => {
    const requests = requestValues.map(value => {
      if (typeof value === 'number') {
        return new ScopedReadRequest(new ReadRequest(new Fr(BigInt(value)), 0), address);
      }
      return new ScopedReadRequest(new ReadRequest(new Fr(BigInt(value.value)), value.counter), address);
    });
    return new ClaimedLengthArray(padArrayEnd(requests, ScopedReadRequest.empty(), MAX), requests.length);
  };

  const dedup = (requests: ClaimedLengthArray<ScopedReadRequest, number>) =>
    dedupClaimedLengthArray(requests, areDuplicateReadRequests, ScopedReadRequest.empty());

  const expectResult = (
    result: ClaimedLengthArray<ScopedReadRequest, number>,
    expectedActiveItems: ScopedReadRequest[],
  ) => {
    expect(result.claimedLength).toBe(expectedActiveItems.length);
    expect(result.getActiveItems()).toEqual(expectedActiveItems);
  };

  it('returns empty array for empty input', () => {
    const original = makeRequests([]);
    const result = dedup(original);
    expectResult(result, []);
  });

  it('returns same items when no duplicates', () => {
    const original = makeRequests([1, 2, 3]);
    const result = dedup(original);
    const items = original.getActiveItems();
    expectResult(result, [items[0], items[1], items[2]]);
  });

  it('removes all duplicates', () => {
    const original = makeRequests([5, 5, 5]);
    const result = dedup(original);
    const items = original.getActiveItems();
    expectResult(result, [items[0]]);
  });

  it('removes all duplicates from a full array', () => {
    const duplicates = Array.from({ length: MAX }).map((_, i) => ({ value: 5, counter: i + 1 }));
    const original = makeRequests(duplicates);
    const result = dedup(original);
    const items = original.getActiveItems();
    expectResult(result, [items[0]]);
  });

  it('removes nothing from a full array', () => {
    const uniqueItems = Array.from({ length: MAX }).map((_, i) => i + 1);
    const original = makeRequests(uniqueItems);
    const result = dedup(original);
    const items = original.getActiveItems();
    expectResult(result, items);
  });

  it('keeps first occurrence and preserves order', () => {
    const original = makeRequests([
      { value: 1, counter: 10 },
      { value: 2, counter: 20 },
      { value: 1, counter: 30 },
      { value: 3, counter: 40 },
      { value: 2, counter: 50 },
    ]);
    const result = dedup(original);
    const items = original.getActiveItems();
    expectResult(result, [items[0], items[1], items[3]]);
  });
});
