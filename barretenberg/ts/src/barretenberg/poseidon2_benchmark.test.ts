import { BarretenbergSync, Fr } from '../index.js';
import { OutputType, serializeBufferable } from '../serialize/index.js';

describe('poseidon2Hash benchmark: msgpack vs direct WASM', () => {
  const ITERATIONS = 5000;
  const SIZES = [2, 4, 8, 16, 32];

  var api: BarretenbergSync;

  beforeAll(async () => {
    await BarretenbergSync.initSingleton();
    api = BarretenbergSync.getSingleton();
  });

  function directPoseidon2Hash(inputsBuffer: Fr[]): Fr {
    const inArgs = [inputsBuffer].map(serializeBufferable);
    const outTypes: OutputType[] = [Fr];
    const result = api.getWasm().callWasmExport(
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
      api.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    }

    // Benchmark old direct WASM API
    const directStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      directPoseidon2Hash(inputs);
    }
    const directTime = performance.now() - directStart;

    // Benchmark new msgpack API
    const msgpackStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      api.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    }
    const msgpackTime = performance.now() - msgpackStart;

    // Calculate overhead
    const overhead = ((msgpackTime - directTime) / directTime) * 100;
    const avgDirectTimeUs = (directTime / ITERATIONS) * 1000; // microseconds
    const avgMsgpackTimeUs = (msgpackTime / ITERATIONS) * 1000; // microseconds

    process.stdout.write(`┌─ Size ${size.toString().padStart(3)} field elements ─────────────────┐\n`);
    process.stdout.write(
      `│ Direct WASM:  ${directTime.toFixed(2).padStart(8)}ms (${avgDirectTimeUs.toFixed(2).padStart(7)}µs/call) │\n`,
    );
    process.stdout.write(
      `│ Msgpack API:  ${msgpackTime.toFixed(2).padStart(8)}ms (${avgMsgpackTimeUs.toFixed(2).padStart(7)}µs/call) │\n`,
    );
    process.stdout.write(
      `│ Overhead:     ${overhead >= 0 ? '+' : ''}${overhead.toFixed(2).padStart(7)}%                   │\n`,
    );
    process.stdout.write(`└───────────────────────────────────────────┘\n`);

    // Sanity check: verify both produce same result
    const directResult = directPoseidon2Hash(inputs);
    const msgpackResult = api.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());

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
      const msgpackResult = api.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());
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
      const msgpackResult = api.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('handles edge case: all zeros', () => {
    const zero = new Fr(0n);

    for (const size of [1, 10, 100]) {
      const inputs = Array(size).fill(zero);

      const directResult = directPoseidon2Hash(inputs);
      const msgpackResult = api.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('handles edge case: all ones', () => {
    const one = new Fr(1n);

    for (const size of [1, 10, 100]) {
      const inputs = Array(size).fill(one);

      const directResult = directPoseidon2Hash(inputs);
      const msgpackResult = api.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('handles edge case: maximum field elements', () => {
    const maxElement = new Fr(Fr.MODULUS - 1n);

    for (const size of [1, 5, 10]) {
      const inputs = Array(size).fill(maxElement);

      const directResult = directPoseidon2Hash(inputs);
      const msgpackResult = api.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());
    }
  });
});
