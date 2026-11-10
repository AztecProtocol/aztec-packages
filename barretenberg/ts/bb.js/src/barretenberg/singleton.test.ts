import { jest } from '@jest/globals';

import { BackendType, Barretenberg, BarretenbergSync } from './index.js';

jest.setTimeout(30_000);

// A backend that cannot be created, so initialization fails without touching native code.
const UNUSABLE = { backend: BackendType.Wasm, wasmPath: '/nonexistent/wasm-directory' } as const;

describe.each([
  ['Barretenberg', Barretenberg],
  ['BarretenbergSync', BarretenbergSync],
])('%s.initSingleton', (_name, Api) => {
  afterEach(async () => {
    await Api.destroySingleton();
  });

  it('tries again after a failed initialization instead of caching the failure', async () => {
    const first = await Api.initSingleton(UNUSABLE).catch((err: unknown) => err);
    const second = await Api.initSingleton(UNUSABLE).catch((err: unknown) => err);

    // Not toBeInstanceOf: jest runs the test in its own vm context, so an Error thrown by node's
    // own fs is not an instance of this realm's Error.
    expect((first as Error).message).toMatch(/no such file or directory/);
    expect((second as Error).message).toMatch(/no such file or directory/);
    // A second attempt, not the first one's cached rejection. Caching it would make one bad spawn
    // permanent for the life of the process, with no way back short of a restart.
    expect(second).not.toBe(first);
  });
});

describe('frozen experimental configuration', () => {
  afterEach(async () => {
    await Barretenberg.destroySingleton();
    BarretenbergSync.destroySingleton();
    jest.restoreAllMocks();
  });

  it('refuses to change an asynchronous singleton without losing the existing instance', async () => {
    const instance = new Barretenberg(
      { call: async () => new Uint8Array(), destroy: async () => {} },
      { experimentalOptimizations: true },
    );
    jest.spyOn(Barretenberg, 'new').mockResolvedValue(instance);
    await Barretenberg.initSingleton({ experimentalOptimizations: true });
    await expect(Barretenberg.initSingleton({ experimentalOptimizations: false })).rejects.toThrow(
      'already configured',
    );
    expect(await Barretenberg.initSingleton({ experimentalOptimizations: true })).toBe(instance);
  });

  it('refuses to change a synchronous singleton without losing the existing instance', async () => {
    const instance = new BarretenbergSync(
      { call: () => new Uint8Array(), destroy: () => {} },
      { experimentalOptimizations: true },
    );
    jest.spyOn(BarretenbergSync, 'new').mockResolvedValue(instance);
    await BarretenbergSync.initSingleton({ experimentalOptimizations: true });
    await expect(BarretenbergSync.initSingleton({ experimentalOptimizations: false })).rejects.toThrow(
      'already configured',
    );
    expect(await BarretenbergSync.initSingleton({ experimentalOptimizations: true })).toBe(instance);
  });
});
