import { createHash } from 'crypto';

import { BackendType, Barretenberg, BarretenbergSync } from '../index.js';

// The WASM backends come from @aztec-foundation/bb.js-api (the generic wasm FFI backend of
// ipc-runtime over bb's module); bb.js only selects and configures them.
describe('wasm backends', () => {
  const input = Buffer.from('hello bb.js-api');
  const expected = createHash('blake2s256').update(input).digest();

  it.each([BackendType.Wasm, BackendType.WasmWorker])(
    '%s hashes with 4 threads',
    async backend => {
      const api = await Barretenberg.new({ backend, threads: 4, skipSrsInit: true });
      try {
        const { hash } = await api.blake2s({ data: input });
        expect(Buffer.from(hash)).toEqual(expected);
      } finally {
        await api.destroy();
      }
    },
    60000,
  );

  it('runs bb Warmup on request and keeps answering', async () => {
    const api = await Barretenberg.new({
      backend: BackendType.WasmWorker,
      threads: 4,
      skipSrsInit: true,
      warmup: true,
    });
    try {
      const { hash } = await api.blake2s({ data: input });
      expect(Buffer.from(hash)).toEqual(expected);
    } finally {
      await api.destroy();
    }
  }, 120000);

  it('sync backend runs single-threaded on the calling thread', async () => {
    const api = await BarretenbergSync.new({ backend: BackendType.Wasm });
    try {
      expect(Buffer.from(api.blake2s({ data: input }).hash)).toEqual(expected);
    } finally {
      api.destroy();
    }
  }, 60000);

  it('surfaces bb errors as exceptions', async () => {
    const api = await Barretenberg.new({ backend: BackendType.WasmWorker, threads: 1, skipSrsInit: true });
    try {
      await expect(
        api.srsInitSrs({ numPoints: 100, pointsBuf: new Uint8Array(10), g2Point: new Uint8Array(10) }),
      ).rejects.toThrow(/invalid points_buf size/);
    } finally {
      await api.destroy();
    }
  }, 60000);
});
