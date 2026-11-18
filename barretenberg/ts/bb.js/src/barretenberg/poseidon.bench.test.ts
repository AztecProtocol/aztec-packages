import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

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
  /** The mode's name in BENCH_OUTPUT, where it is part of a dashboard chart's name. */
  key: string;
  hash(inputs: Uint8Array[]): Promise<Uint8Array> | Uint8Array;
  /** `iterations` hashes of `inputs`. */
  run(inputs: Uint8Array[], iterations: number): Promise<void> | void;
}

function asyncModes(name: string, key: string, api: Barretenberg): Mode[] {
  const hash = async (inputs: Uint8Array[]) => (await api.poseidon2Hash({ inputs })).hash;
  return [
    {
      name,
      key,
      hash,
      run: async (inputs, iterations) => {
        for (let i = 0; i < iterations; i++) {
          await api.poseidon2Hash({ inputs });
        }
      },
    },
    {
      name: `${name} Pipelined`,
      key: `${key}_pipelined`,
      hash,
      run: async (inputs, iterations) => {
        const promises = [];
        for (let i = 0; i < iterations; i++) {
          promises.push(api.poseidon2Hash({ inputs }));
        }
        await Promise.all(promises);
      },
    },
  ];
}

function syncMode(name: string, key: string, api: BarretenbergSync): Mode {
  return {
    name,
    key,
    hash: inputs => api.poseidon2Hash({ inputs }).hash,
    run: (inputs, iterations) => {
      for (let i = 0; i < iterations; i++) {
        api.poseidon2Hash({ inputs });
      }
    },
  };
}

/**
 * poseidon2Hash over every backend bb.js has in node, against the WASM module on the calling thread (WASM Sync):
 * - asynchronous (Barretenberg), each off the calling thread: WASM on a worker, a bb process over a unix socket, and
 *   bb's library in-process (napi) on a native thread; each also pipelined, with every call in flight at once;
 * - synchronous (BarretenbergSync): WASM, a bb process over shared memory, and bb's library in-process (napi), each
 *   on the calling thread.
 *
 * With BENCH_OUTPUT set, the µs per call of every mode and size are written there for the benchmark dashboard, as
 * `poseidon2Hash/<size>_fields/<mode>`.
 */
describe('poseidon2Hash benchmark: every backend', () => {
  const ITERATIONS = 10000;
  const SIZES = [2, 4, 8];

  const asyncApis: Barretenberg[] = [];
  const syncApis: BarretenbergSync[] = [];
  let wasm: Mode | undefined;
  const modes: Mode[] = [];
  const benchResults: { name: string; value: number; unit: string }[] = [];

  beforeAll(async () => {
    const newAsync = async (name: string, key: string, options: Parameters<typeof Barretenberg.new>[0]) => {
      try {
        const api = await Barretenberg.new(options);
        asyncApis.push(api);
        modes.push(...asyncModes(name, key, api));
      } catch (error) {
        warnBackendInitialization(name, error);
      }
    };
    const newSync = async (name: string, key: string, options: Parameters<typeof BarretenbergSync.new>[0]) => {
      try {
        const api = await BarretenbergSync.new(options);
        syncApis.push(api);
        modes.push(syncMode(name, key, api));
      } catch (error) {
        warnBackendInitialization(name, error);
      }
    };
    await newSync('WASM Sync', 'wasm_sync', { backend: BackendType.Wasm, threads: 1 });
    wasm = modes[0];
    await newAsync('WASM', 'wasm', { backend: BackendType.Wasm, threads: 1, skipSrsInit: true });
    await newAsync('Native Socket', 'socket', { backend: BackendType.NativeUnixSocket, threads: 1 });
    await newAsync('Napi', 'napi', { backend: BackendType.Napi, skipSrsInit: true });
    await newSync('Native Shared Sync', 'shm_sync', { backend: BackendType.NativeSharedMemory, threads: 1 });
    await newSync('Napi Sync', 'napi_sync', { backend: BackendType.Napi });
  }, 20000);

  afterAll(async () => {
    await Promise.all(asyncApis.map(api => api.destroy()));
    syncApis.forEach(api => api.destroy());
    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(benchResults, null, 2));
    }
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
        const us = await timeUs(mode);
        results.push([mode, us]);
        benchResults.push({ name: `poseidon2Hash/${size}_fields/${mode.key}`, value: us, unit: 'us' });
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
