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
