import { BlockNumber } from '@aztec/foundation/branded-types';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { L2Block } from '@aztec/stdlib/block';

import { ChonkCache, type ChonkVerifierProofResult } from './chonk-cache.js';

describe('ChonkCache', () => {
  let cache: ChonkCache;

  const fakeProof = {} as ChonkVerifierProofResult;

  beforeEach(() => {
    cache = new ChonkCache();
  });

  afterEach(() => {
    cache.stop();
  });

  it('returns undefined from get when txHash is not registered', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('dedupes concurrent getOrCompute calls for the same hash', async () => {
    let calls = 0;
    const factory = () => {
      calls++;
      return Promise.resolve(fakeProof);
    };
    const a = cache.getOrCompute('tx1', factory);
    const b = cache.getOrCompute('tx1', factory);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    await expect(a).resolves.toBe(fakeProof);
  });

  it('exposes the cached promise via get', () => {
    const promise = cache.getOrCompute('tx1', () => Promise.resolve(fakeProof));
    expect(cache.get('tx1')).toBe(promise);
  });

  it('evicts on rejection so a later caller can re-issue', async () => {
    const failing = promiseWithResolvers<ChonkVerifierProofResult>();
    failing.promise.catch(() => {});
    const first = cache.getOrCompute('tx1', () => failing.promise);
    failing.reject(new Error('boom'));
    await expect(first).rejects.toThrow(/boom/);
    expect(cache.get('tx1')).toBeUndefined();

    const second = cache.getOrCompute('tx1', () => Promise.resolve(fakeProof));
    await expect(second).resolves.toBe(fakeProof);
  });

  it('releases entries for supplied blocks', async () => {
    await cache.getOrCompute('tx-a', () => Promise.resolve(fakeProof));
    await cache.getOrCompute('tx-b', () => Promise.resolve(fakeProof));

    const block = await L2Block.random(BlockNumber(1), { txsPerBlock: 1 });
    const txHash = block.body.txEffects[0].txHash.toString();
    await cache.getOrCompute(txHash, () => Promise.resolve(fakeProof));

    expect(cache.get(txHash)).toBeDefined();
    cache.releaseForBlocks([block]);
    expect(cache.get(txHash)).toBeUndefined();
    // Unrelated entries untouched.
    expect(cache.get('tx-a')).toBeDefined();
    expect(cache.get('tx-b')).toBeDefined();
  });

  it('aborts in-flight factories on stop', () => {
    let captured: AbortSignal | undefined;
    const handle = cache.getOrCompute('tx1', signal => {
      captured = signal;
      return new Promise<ChonkVerifierProofResult>(() => {});
    });
    handle.catch(() => {});
    expect(captured?.aborted).toBe(false);
    cache.stop();
    expect(captured?.aborted).toBe(true);
  });

  it('rejects getOrCompute after stop', async () => {
    cache.stop();
    const handle = cache.getOrCompute('tx1', () => Promise.resolve(fakeProof));
    handle.catch(() => {});
    await expect(handle).rejects.toThrow(/stopped/);
  });
});
