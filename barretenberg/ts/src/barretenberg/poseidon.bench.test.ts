import { Barretenberg, BarretenbergSync, Fr } from '../index.js';
import { serializeBufferable } from '../serialize/index.js';
import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { fetchModuleAndThreads } from '../barretenberg_wasm/index.js';
import { BackendType } from './index.js';

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

  afterAll(async () => {
    await wasm.destroy();
    if (wasmApi) {
      await wasmApi.destroy();
    }
    if (nativeSocketApi) {
      await nativeSocketApi.destroy();
    }
    if (nativeShmApi) {
      await nativeShmApi.destroy();
    }
    if (nativeShmSyncApi) {
      nativeShmSyncApi.destroy();
    }
  });

  async function directPoseidon2Hash(inputsBuffer: Fr[]): Promise<Fr> {
    const inArgs = [inputsBuffer].map(serializeBufferable);
    const outTypes = [Fr];
    const result = wasm.callWasmExport(
      'poseidon2_hash',
      inArgs,
      outTypes.map(t => t.SIZE_IN_BYTES),
    );
    const out = result.map((r, i) => outTypes[i].fromBuffer(r));
    return Promise.resolve(out[0]);
  }

  it.each(SIZES)('benchmark with %p field elements', async size => {
    // Generate random inputs
    const inputs = Array(size)
      .fill(0)
      .map(() => Fr.random());

    // Benchmark 1: Direct WASM (baseline - always available)
    const directStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await directPoseidon2Hash(inputs);
    }
    const directTime = performance.now() - directStart;

    // Benchmark 2: WASM (async)
    let wasmTime = 0;
    if (wasmApi) {
      const wasmStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      }
      wasmTime = performance.now() - wasmStart;
    }

    // Benchmark 3: Native Socket (async with non-blocking I/O)
    let nativeSocketTime = 0;
    if (nativeSocketApi) {
      const nativeSocketStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      }
      nativeSocketTime = performance.now() - nativeSocketStart;
    }

    // Benchmark 4: Native Shared Memory (async)
    let nativeShmTime = 0;
    if (nativeShmApi) {
      const nativeShmStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      }
      nativeShmTime = performance.now() - nativeShmStart;
    }

    // Benchmark 5: Native Shared Memory (sync)
    let nativeShmSyncTime = 0;
    if (nativeShmSyncApi) {
      const nativeShmSyncStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      }
      nativeShmSyncTime = performance.now() - nativeShmSyncStart;
    }

    // Calculate metrics (all relative to WASM baseline)
    const directOverhead = ((directTime - wasmTime) / wasmTime) * 100;
    const nativeSocketOverhead = ((nativeSocketTime - wasmTime) / wasmTime) * 100;
    const nativeShmOverhead = ((nativeShmTime - wasmTime) / wasmTime) * 100;
    const nativeShmSyncOverhead = ((nativeShmSyncTime - wasmTime) / wasmTime) * 100;

    const avgDirectTimeUs = (directTime / ITERATIONS) * 1000; // microseconds
    const avgWasmTimeUs = (wasmTime / ITERATIONS) * 1000;
    const avgNativeSocketTimeUs = (nativeSocketTime / ITERATIONS) * 1000;
    const avgNativeShmTimeUs = (nativeShmTime / ITERATIONS) * 1000;
    const avgNativeShmSyncTimeUs = (nativeShmSyncTime / ITERATIONS) * 1000;

    process.stdout.write(`┌─ Size ${size.toString().padStart(3)} field elements ──────────────────────────────────┐\n`);
    const formatOverhead = (overhead: number): string => {
      const sign = overhead >= 0 ? '+' : '-';
      const value = Math.abs(overhead).toFixed(1).padStart(6);
      return `${sign}${value}%`;
    };

    if (wasmApi) {
      process.stdout.write(
        `│ WASM:               ${wasmTime.toFixed(2).padStart(8)}ms (${avgWasmTimeUs.toFixed(2).padStart(7)}µs/call) [baseline] │\n`,
      );
    } else {
      process.stdout.write(`│ WASM:                                          unavailable │\n`);
    }

    process.stdout.write(
      `│ Direct WASM:        ${directTime.toFixed(2).padStart(8)}ms (${avgDirectTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(directOverhead)}   │\n`,
    );

    if (nativeSocketApi) {
      process.stdout.write(
        `│ Native Socket:      ${nativeSocketTime.toFixed(2).padStart(8)}ms (${avgNativeSocketTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeSocketOverhead)}   │\n`,
      );
    } else {
      process.stdout.write(`│ Native Socket:                                 unavailable │\n`);
    }

    if (nativeShmApi) {
      process.stdout.write(
        `│ Native Shared:      ${nativeShmTime.toFixed(2).padStart(8)}ms (${avgNativeShmTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeShmOverhead)}   │\n`,
      );
    } else {
      process.stdout.write(`│ Native Shared:                                 unavailable │\n`);
    }

    if (nativeShmSyncApi) {
      process.stdout.write(
        `│ Native Shared Sync: ${nativeShmSyncTime.toFixed(2).padStart(8)}ms (${avgNativeShmSyncTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeShmSyncOverhead)}   │\n`,
      );
    } else {
      process.stdout.write(`│ Native Shared Sync:                            unavailable │\n`);
    }

    process.stdout.write(`└────────────────────────────────────────────────────────────┘\n`);

    // Sanity check: verify all backends produce same result as direct WASM
    const directResult = await directPoseidon2Hash(inputs);

    if (wasmApi) {
      const wasmResult = await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());
    }

    if (nativeSocketApi) {
      const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeSocketResult.hash)).toEqual(directResult.toBuffer());
    }

    if (nativeShmApi) {
      const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmResult.hash)).toEqual(directResult.toBuffer());
    }

    if (nativeShmSyncApi) {
      const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(directResult.toBuffer());
    }

    // Test always passes, this is just for measuring performance
    expect(true).toBe(true);
  });

  const TEST_VECTORS = [1, 2, 3, 5, 10, 50, 100];
  const NUM_RANDOM_TESTS = 10;

  it.each(TEST_VECTORS)('produces identical results for %p field elements', async size => {
    // Test with multiple random input vectors
    for (let test = 0; test < NUM_RANDOM_TESTS; test++) {
      const inputs = Array(size)
        .fill(0)
        .map(() => Fr.random());

      const directResult = await directPoseidon2Hash(inputs);

      if (wasmApi) {
        const wasmResult = await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
        expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());
      }

      if (nativeSocketApi) {
        const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
        expect(Buffer.from(nativeSocketResult.hash)).toEqual(directResult.toBuffer());
      }

      if (nativeShmApi) {
        const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
        expect(Buffer.from(nativeShmResult.hash)).toEqual(directResult.toBuffer());
      }

      if (nativeShmSyncApi) {
        const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
        expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(directResult.toBuffer());
      }
    }
  });
});
