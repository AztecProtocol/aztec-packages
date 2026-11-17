import { Barretenberg, BarretenbergSync } from '../index.js';
import { BackendType } from './index.js';
import { Fr } from './testing/fields.js';

function warnBackendInitialization(name: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to initialize ${name} backend: ${message}\n`);
}

/** One way of calling poseidon2Hash: a backend, called one at a time or pipelined. */
interface Mode {
  name: string;
  hash(inputs: Uint8Array[]): Promise<Uint8Array> | Uint8Array;
  /** `iterations` hashes of `inputs`. */
  run(inputs: Uint8Array[], iterations: number): Promise<void> | void;
}

function asyncModes(name: string, api: Barretenberg, pipelined: boolean): Mode[] {
  const hash = async (inputs: Uint8Array[]) => (await api.poseidon2Hash({ inputs })).hash;
  const modes: Mode[] = [
    {
      name,
      hash,
      run: async (inputs, iterations) => {
        for (let i = 0; i < iterations; i++) {
          await api.poseidon2Hash({ inputs });
        }
      },
    },
  ];
  if (pipelined) {
    modes.push({
      name: `${name} Pipelined`,
      hash,
      run: async (inputs, iterations) => {
        const promises = [];
        for (let i = 0; i < iterations; i++) {
          promises.push(api.poseidon2Hash({ inputs }));
        }
        await Promise.all(promises);
      },
    });
  }
  return modes;
}

function syncMode(name: string, api: BarretenbergSync): Mode {
  return {
    name,
    hash: inputs => api.poseidon2Hash({ inputs }).hash,
    run: (inputs, iterations) => {
      for (let i = 0; i < iterations; i++) {
        api.poseidon2Hash({ inputs });
      }
    },
  };
}

/**
 * poseidon2Hash over every backend bb.js has in node, against the WASM module on the calling thread:
 * - asynchronous (Barretenberg): WASM, a bb process over a unix socket, and bb's library in-process (napi) on a
 *   worker thread; the last two also pipelined, with every call in flight at once;
 * - synchronous (BarretenbergSync): a bb process over shared memory, and bb's library in-process on the calling
 *   thread.
 */
describe('poseidon2Hash benchmark: every backend', () => {
  const ITERATIONS = 10000;
  const SIZES = [2, 4, 8];

  const asyncApis: Barretenberg[] = [];
  const syncApis: BarretenbergSync[] = [];
  let wasm: Mode | undefined;
  const modes: Mode[] = [];

  beforeAll(async () => {
    const newAsync = async (name: string, options: Parameters<typeof Barretenberg.new>[0], pipelined: boolean) => {
      try {
        const api = await Barretenberg.new(options);
        asyncApis.push(api);
        modes.push(...asyncModes(name, api, pipelined));
      } catch (error) {
        warnBackendInitialization(name, error);
      }
    };
    const newSync = async (name: string, options: Parameters<typeof BarretenbergSync.new>[0]) => {
      try {
        const api = await BarretenbergSync.new(options);
        syncApis.push(api);
        modes.push(syncMode(name, api));
      } catch (error) {
        warnBackendInitialization(name, error);
      }
    };
    await newAsync('WASM', { backend: BackendType.Wasm, threads: 1, skipSrsInit: true }, false);
    wasm = modes[0];
    await newAsync('Native Socket', { backend: BackendType.NativeUnixSocket, threads: 1 }, true);
    await newAsync('Napi', { backend: BackendType.Napi, skipSrsInit: true }, true);
    await newSync('Native Shared Sync', { backend: BackendType.NativeSharedMemory, threads: 1 });
    await newSync('Napi Sync', { backend: BackendType.Napi });
  }, 20000);

  afterAll(async () => {
    await Promise.all(asyncApis.map(api => api.destroy()));
    syncApis.forEach(api => api.destroy());
  });

  it.each(SIZES)(
    'benchmark with %p field elements',
    async size => {
      const inputs = Array(size)
        .fill(0)
        .map(() => Fr.random().toBuffer());

      // Each mode runs once untimed first, so the JIT has seen the exact call pattern being timed (a pipelined burst
      // exercises different code paths from sequential awaits) and the timing reflects steady state.
      const timeUs = async (mode: Mode) => {
        await mode.run(inputs, ITERATIONS);
        const start = performance.now();
        await mode.run(inputs, ITERATIONS);
        return ((performance.now() - start) / ITERATIONS) * 1000;
      };
      const results: [Mode, number][] = [];
      for (const mode of modes) {
        results.push([mode, await timeUs(mode)]);
      }
      const baseline = results.find(([mode]) => mode === wasm)?.[1];

      const lines = [`┌─ Size ${size.toString().padStart(3)} field elements, µs per call`];
      for (const [mode, us] of results) {
        const relative =
          baseline === undefined || mode === wasm
            ? '[baseline]'
            : `${us >= baseline ? '+' : '-'}${Math.abs(((us - baseline) / baseline) * 100).toFixed(1)}%`;
        lines.push(`│ ${`${mode.name}:`.padEnd(26)} ${us.toFixed(2).padStart(8)}µs  ${relative}`);
      }
      lines.push('└─');
      process.stdout.write(lines.join('\n') + '\n');

      const expected = Buffer.from(await wasm!.hash(inputs));
      for (const [mode] of results) {
        expect(Buffer.from(await mode.hash(inputs))).toEqual(expected);
      }
    },
    120000,
  );

  const TEST_VECTORS = [1, 2, 3, 5, 10, 50, 100];
  const NUM_RANDOM_TESTS = 10;

  it.each(TEST_VECTORS)('produces identical results for %p field elements', async size => {
    for (let test = 0; test < NUM_RANDOM_TESTS; test++) {
      const inputs = Array(size)
        .fill(0)
        .map(() => Fr.random().toBuffer());
      const expected = Buffer.from(await wasm!.hash(inputs));
      for (const mode of modes) {
        expect(Buffer.from(await mode.hash(inputs))).toEqual(expected);
      }
    }
  });
});
