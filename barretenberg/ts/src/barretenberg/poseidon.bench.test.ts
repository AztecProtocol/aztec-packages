import { Barretenberg, BarretenbergSync } from '../index.js';
import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { fetchModuleAndThreads } from '../barretenberg_wasm/index.js';
import { BackendType } from './index.js';
import { Fr } from './testing/fields.js';

/**
 * Async API benchmark test: WASM vs Native backends with proper non-blocking I/O
 *
 * This test uses the async Barretenberg API which properly handles:
 * - Non-blocking I/O for native backend (event-based)
 * - Concurrent operations via promises
 * - Better performance for native backend compared to sync API
 */
describe('poseidon2Hash benchmark (Async API): WASM vs Native', () => {
  const ITERATIONS = 10000;
  const SIZES = [2, 4, 8];

  let wasmApi: Barretenberg | null = null;
  let nativeSocketApi: Barretenberg | null = null;
  let nativeShmApi: Barretenberg | null = null;
  let nativeShmSyncApi: BarretenbergSync | null = null;
  let wasm: BarretenbergWasmMain;

  beforeAll(async () => {
    // Setup direct WASM access for baseline benchmark (always required)
    wasm = new BarretenbergWasmMain();
    const { module } = await fetchModuleAndThreads(1);
    await wasm.init(module, 1);

    // Setup WASM API
    try {
      wasmApi = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1 });
    } catch (error) {
      console.warn('Failed to initialize WASM backend:', error instanceof Error ? error.message : String(error));
    }

    // Setup native socket API
    try {
      nativeSocketApi = await Barretenberg.new({ backend: BackendType.NativeUnixSocket, threads: 1 });
    } catch (error) {
      console.warn(
        'Failed to initialize Native Socket backend:',
        error instanceof Error ? error.message : String(error),
      );
    }

    // Setup native shared memory API (async)
    try {
      nativeShmApi = await Barretenberg.new({ backend: BackendType.NativeSharedMemory, threads: 1 });
    } catch (error) {
      console.warn(
        'Failed to initialize Native Shared Memory (async) backend:',
        error instanceof Error ? error.message : String(error),
      );
    }

    // Setup native shared memory API (sync)
    try {
      nativeShmSyncApi = await BarretenbergSync.new({ backend: BackendType.NativeSharedMemory, threads: 1 });
    } catch (error) {
      console.warn(
        'Failed to initialize Native Shared Memory (sync) backend:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }, 20000);

  it.each(SIZES)(
    'benchmark with %p field elements',
    async size => {
      // Generate random inputs
      const inputs = Array(size)
        .fill(0)
        .map(() => Fr.random().toBuffer());

      // Benchmark 1: WASM (async)
      let wasmTime = 0;
      if (wasmApi) {
        const wasmStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
          await wasmApi.poseidon2Hash({ inputs });
        }
        wasmTime = performance.now() - wasmStart;
      }

      // Benchmark 2: Native Socket (async with non-blocking I/O)
      let nativeSocketTime = 0;
      if (nativeSocketApi) {
        const nativeSocketStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
          await nativeSocketApi.poseidon2Hash({ inputs });
        }
        nativeSocketTime = performance.now() - nativeSocketStart;
      }

      // Benchmark 3: Native Socket (async, request pipelined)
      let nativeSocketPipelinedTime = 0;
      if (nativeSocketApi) {
        const nativeSocketPipelinedStart = performance.now();
        // Use promise.all to pipeline requests
        const promises = [];
        for (let i = 0; i < ITERATIONS; i++) {
          promises.push(nativeSocketApi.poseidon2Hash({ inputs }));
        }
        await Promise.all(promises);
        nativeSocketPipelinedTime = performance.now() - nativeSocketPipelinedStart;
      }

      // Benchmark 4: Native Shared Memory (async)
      let nativeShmTime = 0;
      if (nativeShmApi) {
        const nativeShmStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
          await nativeShmApi.poseidon2Hash({ inputs });
        }
        nativeShmTime = performance.now() - nativeShmStart;
      }

      // Benchmark 5: Native Shared Memory (async, request pipelined)
      let nativeShmPipelinedTime = 0;
      if (nativeShmApi) {
        const nativeShmPipelinedStart = performance.now();
        // Use promise.all to pipeline requests
        const promises = [];
        for (let i = 0; i < ITERATIONS; i++) {
          promises.push(nativeShmApi.poseidon2Hash({ inputs }));
        }
        await Promise.all(promises);
        nativeShmPipelinedTime = performance.now() - nativeShmPipelinedStart;
      }

      // Benchmark 6: Native Shared Memory (sync)
      let nativeShmSyncTime = 0;
      if (nativeShmSyncApi) {
        const nativeShmSyncStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
          nativeShmSyncApi.poseidon2Hash({ inputs });
        }
        nativeShmSyncTime = performance.now() - nativeShmSyncStart;
      }

      // Calculate metrics (all relative to WASM baseline)
      const nativeSocketOverhead = ((nativeSocketTime - wasmTime) / wasmTime) * 100;
      const nativeSocketPipelinedOverhead = ((nativeSocketPipelinedTime - wasmTime) / wasmTime) * 100;
      const nativeShmOverhead = ((nativeShmTime - wasmTime) / wasmTime) * 100;
      const nativeShmPipelinedOverhead = ((nativeShmPipelinedTime - wasmTime) / wasmTime) * 100;
      const nativeShmSyncOverhead = ((nativeShmSyncTime - wasmTime) / wasmTime) * 100;

      const avgWasmTimeUs = (wasmTime / ITERATIONS) * 1000;
      const avgNativeSocketTimeUs = (nativeSocketTime / ITERATIONS) * 1000;
      const avgNativeSocketPipelinedTimeUs = (nativeSocketPipelinedTime / ITERATIONS) * 1000;
      const avgNativeShmTimeUs = (nativeShmTime / ITERATIONS) * 1000;
      const avgNativeShmPipelinedTimeUs = (nativeShmPipelinedTime / ITERATIONS) * 1000;
      const avgNativeShmSyncTimeUs = (nativeShmSyncTime / ITERATIONS) * 1000;

      process.stdout.write(
        `┌─ Size ${size.toString().padStart(3)} field elements ───────────────────────────────────────┐\n`,
      );
      const formatOverhead = (overhead: number): string => {
        const sign = overhead >= 0 ? '+' : '-';
        const value = Math.abs(overhead).toFixed(1).padStart(6);
        return `${sign}${value}%`;
      };

      if (wasmApi) {
        process.stdout.write(
          `│ WASM:                    ${wasmTime.toFixed(2).padStart(8)}ms (${avgWasmTimeUs.toFixed(2).padStart(7)}µs/call) [baseline] │\n`,
        );
      } else {
        process.stdout.write(`│ WASM:                                               unavailable │\n`);
      }

      if (nativeSocketApi) {
        process.stdout.write(
          `│ Native Socket:           ${nativeSocketTime.toFixed(2).padStart(8)}ms (${avgNativeSocketTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeSocketOverhead)}   │\n`,
        );
      } else {
        process.stdout.write(`│ Native Socket:                                      unavailable │\n`);
      }

      if (nativeSocketApi) {
        process.stdout.write(
          `│ Native Socket Pipelined: ${nativeSocketPipelinedTime
            .toFixed(2)
            .padStart(8)}ms (${avgNativeSocketPipelinedTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(
            nativeSocketPipelinedOverhead,
          )}   │\n`,
        );
      } else {
        process.stdout.write(`│ Native Socket Pipelined:                            unavailable │\n`);
      }

      if (nativeShmApi) {
        process.stdout.write(
          `│ Native Shared:           ${nativeShmTime.toFixed(2).padStart(8)}ms (${avgNativeShmTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeShmOverhead)}   │\n`,
        );
      } else {
        process.stdout.write(`│ Native Shared:                                      unavailable │\n`);
      }

      if (nativeShmApi) {
        process.stdout.write(
          `│ Native Shared Pipelined: ${nativeShmPipelinedTime.toFixed(2).padStart(8)}ms (${avgNativeShmPipelinedTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeShmPipelinedOverhead)}   │\n`,
        );
      } else {
        process.stdout.write(`│ Native Shared Pipelined:                            unavailable │\n`);
      }

      if (nativeShmSyncApi) {
        process.stdout.write(
          `│ Native Shared Sync:      ${nativeShmSyncTime.toFixed(2).padStart(8)}ms (${avgNativeShmSyncTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeShmSyncOverhead)}   │\n`,
        );
      } else {
        process.stdout.write(`│ Native Shared Sync:                                 unavailable │\n`);
      }

      process.stdout.write(`└─────────────────────────────────────────────────────────────────┘\n`);

      const wasmResult = await wasmApi!.poseidon2Hash({ inputs });

      if (nativeSocketApi) {
        const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeSocketResult.hash)).toEqual(wasmResult.hash);
      }

      if (nativeShmApi) {
        const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeShmResult.hash)).toEqual(wasmResult.hash);
      }

      if (nativeShmSyncApi) {
        const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(wasmResult.hash);
      }

      // Test always passes, this is just for measuring performance
      expect(true).toBe(true);
    },
    10000,
  );

  const TEST_VECTORS = [1, 2, 3, 5, 10, 50, 100];
  const NUM_RANDOM_TESTS = 10;

  it.each(TEST_VECTORS)('produces identical results for %p field elements', async size => {
    // Test with multiple random input vectors
    for (let test = 0; test < NUM_RANDOM_TESTS; test++) {
      const inputs = Array(size)
        .fill(0)
        .map(() => Fr.random().toBuffer());

      const wasmResult = await wasmApi!.poseidon2Hash({ inputs });

      if (nativeSocketApi) {
        const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeSocketResult.hash)).toEqual(wasmResult.hash);
      }

      if (nativeShmApi) {
        const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeShmResult.hash)).toEqual(wasmResult.hash);
      }

      if (nativeShmSyncApi) {
        const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs });
        expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(wasmResult.hash);
      }
    }
  });
});
