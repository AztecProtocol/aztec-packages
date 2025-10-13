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
  const ITERATIONS = 3000;
  const SIZES = [2, 4, 8, 16, 32];

  let wasmApi: Barretenberg;
  let nativeSocketApi: Barretenberg;
  let nativeShmApi: Barretenberg;
  let nativeShmSyncApi: BarretenbergSync;
  let wasm: BarretenbergWasmMain;

  beforeAll(async () => {
    // Setup WASM API
    // Use threads: 1 for faster startup in benchmarks
    wasmApi = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1 });

    // Setup native socket API
    nativeSocketApi = await Barretenberg.new({ backend: BackendType.NativeUnixSocket, threads: 1 });

    // Setup native shared memory API (async)
    nativeShmApi = await Barretenberg.new({ backend: BackendType.NativeSharedMemory, threads: 1 });

    // Setup native shared memory API (sync)
    nativeShmSyncApi = await BarretenbergSync.new({ backend: BackendType.NativeSharedMemory, threads: 1 });

    // Setup direct WASM access for baseline benchmark
    wasm = new BarretenbergWasmMain();
    const { module } = await fetchModuleAndThreads(1);
    await wasm.init(module, 1);
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

    // Warm up phase (100 iterations each)
    for (let i = 0; i < 100; i++) {
      await directPoseidon2Hash(inputs);
      await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    }

    // Benchmark 1: Direct WASM (baseline)
    const directStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await directPoseidon2Hash(inputs);
    }
    const directTime = performance.now() - directStart;

    // Benchmark 2: WASM (async)
    const wasmStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    }
    const wasmTime = performance.now() - wasmStart;

    // Benchmark 3: Native Socket (async with non-blocking I/O)
    const nativeSocketStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    }
    const nativeSocketTime = performance.now() - nativeSocketStart;

    // Benchmark 4: Native Shared Memory (async)
    const nativeShmStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    }
    const nativeShmTime = performance.now() - nativeShmStart;

    // Benchmark 5: Native Shared Memory (sync)
    const nativeShmSyncStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    }
    const nativeShmSyncTime = performance.now() - nativeShmSyncStart;

    // Calculate metrics (all relative to Direct WASM)
    const wasmOverhead = ((wasmTime - directTime) / directTime) * 100;
    const nativeSocketOverhead = ((nativeSocketTime - directTime) / directTime) * 100;
    const nativeShmOverhead = ((nativeShmTime - directTime) / directTime) * 100;
    const nativeShmSyncOverhead = ((nativeShmSyncTime - directTime) / directTime) * 100;

    const avgDirectTimeUs = (directTime / ITERATIONS) * 1000; // microseconds
    const avgWasmTimeUs = (wasmTime / ITERATIONS) * 1000;
    const avgNativeSocketTimeUs = (nativeSocketTime / ITERATIONS) * 1000;
    const avgNativeShmTimeUs = (nativeShmTime / ITERATIONS) * 1000;
    const avgNativeShmSyncTimeUs = (nativeShmSyncTime / ITERATIONS) * 1000;

    process.stdout.write(`┌─ Size ${size.toString().padStart(3)} field elements ───────────────────────────────────┐\n`);
    process.stdout.write(
      `│ Direct WASM:        ${directTime.toFixed(2).padStart(8)}ms (${avgDirectTimeUs.toFixed(2).padStart(7)}µs/call) [baseline] │\n`,
    );
    const formatOverhead = (overhead: number): string => {
      const sign = overhead >= 0 ? '+' : '-';
      const value = Math.abs(overhead).toFixed(1).padStart(6);
      return `${sign}${value}%`;
    };

    process.stdout.write(
      `│ WASM:               ${wasmTime.toFixed(2).padStart(8)}ms (${avgWasmTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(wasmOverhead)}   │\n`,
    );
    process.stdout.write(
      `│ Native Socket:      ${nativeSocketTime.toFixed(2).padStart(8)}ms (${avgNativeSocketTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeSocketOverhead)}   │\n`,
    );
    process.stdout.write(
      `│ Native Shared:      ${nativeShmTime.toFixed(2).padStart(8)}ms (${avgNativeShmTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeShmOverhead)}   │\n`,
    );
    process.stdout.write(
      `│ Native Shared Sync: ${nativeShmSyncTime.toFixed(2).padStart(8)}ms (${avgNativeShmSyncTimeUs.toFixed(2).padStart(7)}µs/call) ${formatOverhead(nativeShmSyncOverhead)}   │\n`,
    );
    process.stdout.write(`└─────────────────────────────────────────────────────────────┘\n`);

    // Sanity check: verify all produce same result
    const directResult = await directPoseidon2Hash(inputs);
    const wasmResult = await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

    const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    expect(Buffer.from(nativeSocketResult.hash)).toEqual(directResult.toBuffer());

    const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    expect(Buffer.from(nativeShmResult.hash)).toEqual(directResult.toBuffer());

    const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(directResult.toBuffer());

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
      const wasmResult = await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

      const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeSocketResult.hash)).toEqual(directResult.toBuffer());

      const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmResult.hash)).toEqual(directResult.toBuffer());

      const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('produces identical results for known test vectors', async () => {
    const zero = new Fr(0n);
    const one = new Fr(1n);
    const two = new Fr(2n);
    const max = new Fr(Fr.MODULUS - 1n);

    // Test with specific known values
    const testCases = [
      // Single zero
      [zero],
      // Single one
      [one],
      // Two zeros
      [zero, zero],
      // Sequential values
      [zero, one, two],
      // Maximum field element
      [max],
    ];

    for (const inputs of testCases) {
      const directResult = await directPoseidon2Hash(inputs);
      const wasmResult = await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

      const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeSocketResult.hash)).toEqual(directResult.toBuffer());

      const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmResult.hash)).toEqual(directResult.toBuffer());

      const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('handles edge case: all zeros', async () => {
    const zero = new Fr(0n);

    for (const size of [1, 10, 100]) {
      const inputs = Array(size).fill(zero);

      const directResult = await directPoseidon2Hash(inputs);
      const wasmResult = await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

      const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeSocketResult.hash)).toEqual(directResult.toBuffer());

      const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmResult.hash)).toEqual(directResult.toBuffer());

      const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('handles edge case: all ones', async () => {
    const one = new Fr(1n);

    for (const size of [1, 10, 100]) {
      const inputs = Array(size).fill(one);

      const directResult = await directPoseidon2Hash(inputs);
      const wasmResult = await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

      const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeSocketResult.hash)).toEqual(directResult.toBuffer());

      const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmResult.hash)).toEqual(directResult.toBuffer());

      const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('handles edge case: maximum field elements', async () => {
    const maxElement = new Fr(Fr.MODULUS - 1n);

    for (const size of [1, 5, 10]) {
      const inputs = Array(size).fill(maxElement);

      const directResult = await directPoseidon2Hash(inputs);
      const wasmResult = await wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

      const nativeSocketResult = await nativeSocketApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeSocketResult.hash)).toEqual(directResult.toBuffer());

      const nativeShmResult = await nativeShmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmResult.hash)).toEqual(directResult.toBuffer());

      const nativeShmSyncResult = nativeShmSyncApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeShmSyncResult.hash)).toEqual(directResult.toBuffer());
    }
  });
});
