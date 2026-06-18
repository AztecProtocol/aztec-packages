import { openTmpStore } from '../browser/index.js';

describe('kv-store/browser entrypoint', () => {
  it('opens a working store via the browser alias and round-trips a value', async () => {
    const store = await openTmpStore(true);
    const map = store.openMap<string, number>('smoke');
    await map.set('a', 1);
    expect(await map.getAsync('a')).toBe(1);
    await store.close();
  });
});
