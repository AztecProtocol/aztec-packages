// barretenberg/ts/src/barretenberg/withAbort.test.ts
import { withAbort } from './backend.js';

describe('withAbort', () => {
  it('resolves when not aborted', async () => {
    const res = await withAbort(undefined, async () => 42);
    expect(res).toBe(42);
  });

  it('rejects immediately if signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      withAbort(ctrl.signal, async () => 0),
    ).rejects.toThrow(/Proving aborted/);
  });

  it('rejects if signal aborts during execution', async () => {
    const ctrl = new AbortController();
    const p = withAbort(ctrl.signal, async () => {
      await new Promise(r => setTimeout(r, 10));
      return 1;
    });
    ctrl.abort();
    await expect(p).rejects.toThrow(/Proving aborted/);
  });
});
