import { BackendType, Barretenberg, BarretenbergSync } from './index.js';

describe('isAlive over wasm', () => {
  const started: { isAlive(): boolean; destroy(): void | Promise<void> }[] = [];

  afterEach(async () => {
    for (const api of started.splice(0)) {
      if (api.isAlive()) {
        await api.destroy();
      }
    }
    await Barretenberg.destroySingleton();
    BarretenbergSync.destroySingleton();
  });

  it.each([BackendType.WasmWorker, BackendType.Wasm])(
    'Barretenberg (%s) is alive until destroyed, and destroy is idempotent',
    async backend => {
      const api = await Barretenberg.new({ threads: 1, backend, skipSrsInit: true });
      started.push(api);
      expect(api.isAlive()).toBe(true);
      await api.destroy();
      expect(api.isAlive()).toBe(false);
      await api.destroy();
      expect(api.isAlive()).toBe(false);
    },
  );

  it('BarretenbergSync is alive until destroyed, and destroy is idempotent', async () => {
    const api = await BarretenbergSync.new({ backend: BackendType.Wasm });
    started.push(api);
    expect(api.isAlive()).toBe(true);
    api.destroy();
    expect(api.isAlive()).toBe(false);
    api.destroy();
    expect(api.isAlive()).toBe(false);
  });

  it('BarretenbergSync.initSingleton replaces a singleton that is no longer alive', async () => {
    const first = await BarretenbergSync.initSingleton({ backend: BackendType.Wasm });
    first.destroy();
    const second = await BarretenbergSync.initSingleton({ backend: BackendType.Wasm });
    expect(second).not.toBe(first);
    expect(second.isAlive()).toBe(true);
    expect(BarretenbergSync.getSingleton()).toBe(second);
  });
});
