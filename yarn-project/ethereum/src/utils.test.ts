import type { Abi } from 'viem';

import { mergeAbis } from './utils.js';

describe('mergeAbis', () => {
  it('dedupes identical function items', () => {
    const fn = {
      type: 'function',
      name: 'foo',
      stateMutability: 'view',
      inputs: [{ name: 'a', type: 'uint256' }],
      outputs: [{ name: '', type: 'uint256' }],
    } as const;

    const abi1: Abi = [fn];
    const abi2: Abi = [fn];
    const merged = mergeAbis([abi1, abi2]);

    expect(merged).toHaveLength(1);
  });

  it('keeps function items that differ by output types', () => {
    const fn1 = {
      type: 'function',
      name: 'foo',
      stateMutability: 'view',
      inputs: [{ name: 'a', type: 'uint256' }],
      outputs: [{ name: '', type: 'uint256' }],
    } as const;

    const fn2 = {
      type: 'function',
      name: 'foo',
      stateMutability: 'view',
      inputs: [{ name: 'a', type: 'uint256' }],
      outputs: [{ name: '', type: 'bool' }],
    } as const;

    const merged = mergeAbis([[fn1], [fn2]]);

    expect(merged).toHaveLength(2);
  });

  it('keeps event items that differ by indexed flags', () => {
    const eventIndexed = {
      type: 'event',
      name: 'DidThing',
      inputs: [{ name: 'who', type: 'address', indexed: true }],
    } as const;

    const eventNonIndexed = {
      type: 'event',
      name: 'DidThing',
      inputs: [{ name: 'who', type: 'address', indexed: false }],
    } as const;

    const merged = mergeAbis([[eventIndexed], [eventNonIndexed]]);

    expect(merged).toHaveLength(2);
  });
});
