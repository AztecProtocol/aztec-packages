import { BarretenbergSync, Fr } from '../index.js';
import { serializeBufferable } from '../serialize/index.js';
import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { fetchModuleAndThreads } from '../barretenberg_wasm/index.js';
import { findBbBinary } from '../backend/platform.js';

/**
 * We keep some old api stuff lingering for insights into msgpack overheads.
 * Once this is no longer needed we can delete:
 * - barretenberg/poseidon2_benchmark.test.ts
 * - barretenberg_wasm/barretenberg_wasm_main/heap_allocator.ts
 * - serialize/serialize.ts
 * and the following methods from BarretenbergWasmMain:
 * - callWasmExport
 * - getOutputArgs
 */
describe('poseidon2Hash benchmark: WASM vs Native', () => {
  const ITERATIONS = 5000;
  const SIZES = [2, 4, 8, 16, 32];

  let wasmApi: BarretenbergSync;
  let nativeApi: BarretenbergSync | null = null;
  let wasm: BarretenbergWasmMain;
  let hasNative: boolean = false;

  beforeAll(async () => {
    // Setup WASM API (force WASM by passing empty bbPath which won't exist)
    wasmApi = await BarretenbergSync['new']({ bbPath: '/nonexistent/bb' });

    // Setup direct WASM access for baseline benchmark
    wasm = new BarretenbergWasmMain();
    const { module } = await fetchModuleAndThreads();
    await wasm.init(module, 1);

    // Try to setup native API if available
    const bbPath = findBbBinary(
      '/mnt/user-data/charlie/aztec-repos/aztec-packages/barretenberg/cpp/build-no-avm/bin/bb',
    );
    if (bbPath) {
      hasNative = true;
      nativeApi = await BarretenbergSync['new']({ bbPath });
    }
  }, 20000);

  afterAll(async () => {
    await wasm.destroy();
    if (wasmApi) {
      wasmApi.destroy();
    }
    if (nativeApi) {
      nativeApi.destroy();
    }
  });

  function directPoseidon2Hash(inputsBuffer: Fr[]): Fr {
    const inArgs = [inputsBuffer].map(serializeBufferable);
    const outTypes = [Fr];
    const result = wasm.callWasmExport(
      'poseidon2_hash',
      inArgs,
      outTypes.map(t => t.SIZE_IN_BYTES),
    );
    const out = result.map((r, i) => outTypes[i].fromBuffer(r));
    return out[0];
  }

  it.each(SIZES)('benchmark with %p field elements', size => {
    // Generate random inputs
    const inputs = Array(size)
      .fill(0)
      .map(() => Fr.random());

    // Warm up phase (100 iterations each)
    for (let i = 0; i < 100; i++) {
      directPoseidon2Hash(inputs);
      wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      if (hasNative && nativeApi) {
        nativeApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      }
    }

    // Benchmark 1: Direct WASM API (baseline)
    const directStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      directPoseidon2Hash(inputs);
    }
    const directTime = performance.now() - directStart;

    // Benchmark 2: WASM msgpack API
    const wasmMsgpackStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    }
    const wasmMsgpackTime = performance.now() - wasmMsgpackStart;

    // Benchmark 3: Native msgpack API (if available)
    let nativeTime = 0;
    if (hasNative && nativeApi) {
      const nativeStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        nativeApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      }
      nativeTime = performance.now() - nativeStart;
    }

    // Calculate metrics
    const wasmOverhead = ((wasmMsgpackTime - directTime) / directTime) * 100;
    const avgDirectTimeUs = (directTime / ITERATIONS) * 1000; // microseconds
    const avgWasmMsgpackTimeUs = (wasmMsgpackTime / ITERATIONS) * 1000;

    process.stdout.write(`┌─ Size ${size.toString().padStart(3)} field elements ─────────────────────────┐\n`);
    process.stdout.write(
      `│ Direct WASM:    ${directTime.toFixed(2).padStart(8)}ms (${avgDirectTimeUs.toFixed(2).padStart(7)}µs/call) │\n`,
    );
    process.stdout.write(
      `│ WASM Msgpack:   ${wasmMsgpackTime.toFixed(2).padStart(8)}ms (${avgWasmMsgpackTimeUs.toFixed(2).padStart(7)}µs/call) │\n`,
    );

    if (hasNative && nativeApi) {
      const avgNativeTimeUs = (nativeTime / ITERATIONS) * 1000;
      const nativeVsWasm = ((nativeTime - wasmMsgpackTime) / wasmMsgpackTime) * 100;
      const nativeVsDirect = ((nativeTime - directTime) / directTime) * 100;

      process.stdout.write(
        `│ Native Msgpack: ${nativeTime.toFixed(2).padStart(8)}ms (${avgNativeTimeUs.toFixed(2).padStart(7)}µs/call) │\n`,
      );
      process.stdout.write(
        `│ WASM overhead:  ${wasmOverhead >= 0 ? '+' : ''}${wasmOverhead.toFixed(2).padStart(7)}%                      │\n`,
      );
      process.stdout.write(
        `│ Native vs WASM: ${nativeVsWasm >= 0 ? '+' : ''}${nativeVsWasm.toFixed(2).padStart(7)}%                      │\n`,
      );
      process.stdout.write(
        `│ Native vs Base: ${nativeVsDirect >= 0 ? '+' : ''}${nativeVsDirect.toFixed(2).padStart(7)}%                      │\n`,
      );
    } else {
      process.stdout.write(
        `│ WASM overhead:  ${wasmOverhead >= 0 ? '+' : ''}${wasmOverhead.toFixed(2).padStart(7)}%                      │\n`,
      );
      process.stdout.write(`│ Native backend: Not available                    │\n`);
    }
    process.stdout.write(`└──────────────────────────────────────────────────┘\n`);

    // Sanity check: verify all produce same result
    const directResult = directPoseidon2Hash(inputs);
    const wasmMsgpackResult = wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    expect(Buffer.from(wasmMsgpackResult.hash)).toEqual(directResult.toBuffer());

    if (hasNative && nativeApi) {
      const nativeMsgpackResult = nativeApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
      expect(Buffer.from(nativeMsgpackResult.hash)).toEqual(directResult.toBuffer());
    }

    // Test always passes, this is just for measuring performance
    expect(true).toBe(true);
  });

  const TEST_VECTORS = [1, 2, 3, 5, 10, 50, 100];
  const NUM_RANDOM_TESTS = 10;

  it.each(TEST_VECTORS)('produces identical results for %p field elements', size => {
    // Test with multiple random input vectors
    for (let test = 0; test < NUM_RANDOM_TESTS; test++) {
      const inputs = Array(size)
        .fill(0)
        .map(() => Fr.random());

      const directResult = directPoseidon2Hash(inputs);
      const wasmResult = wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

      // Also test native if available
      if (hasNative && nativeApi) {
        const nativeResult = nativeApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
        expect(Buffer.from(nativeResult.hash)).toEqual(directResult.toBuffer());
      }
    }
  });

  it('produces identical results for known test vectors', () => {
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
      const directResult = directPoseidon2Hash(inputs);
      const wasmResult = wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

      // Also test native if available
      if (hasNative && nativeApi) {
        const nativeResult = nativeApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
        expect(Buffer.from(nativeResult.hash)).toEqual(directResult.toBuffer());
      }
    }
  });

  it('handles edge case: all zeros', () => {
    const zero = new Fr(0n);

    for (const size of [1, 10, 100]) {
      const inputs = Array(size).fill(zero);

      const directResult = directPoseidon2Hash(inputs);
      const wasmResult = wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

      // Also test native if available
      if (hasNative && nativeApi) {
        const nativeResult = nativeApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
        expect(Buffer.from(nativeResult.hash)).toEqual(directResult.toBuffer());
      }
    }
  });

  it('handles edge case: all ones', () => {
    const one = new Fr(1n);

    for (const size of [1, 10, 100]) {
      const inputs = Array(size).fill(one);

      const directResult = directPoseidon2Hash(inputs);
      const wasmResult = wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

      // Also test native if available
      if (hasNative && nativeApi) {
        const nativeResult = nativeApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
        expect(Buffer.from(nativeResult.hash)).toEqual(directResult.toBuffer());
      }
    }
  });

  it('handles edge case: maximum field elements', () => {
    const maxElement = new Fr(Fr.MODULUS - 1n);

    for (const size of [1, 5, 10]) {
      const inputs = Array(size).fill(maxElement);

      const directResult = directPoseidon2Hash(inputs);
      const wasmResult = wasmApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(wasmResult.hash)).toEqual(directResult.toBuffer());

      // Also test native if available
      if (hasNative && nativeApi) {
        const nativeResult = nativeApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
        expect(Buffer.from(nativeResult.hash)).toEqual(directResult.toBuffer());
      }
    }
  });
});
