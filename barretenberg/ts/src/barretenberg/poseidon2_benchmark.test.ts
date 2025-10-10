import { BarretenbergSync, Fr as FrBarretenberg } from '../index.js';

describe('poseidon2Hash benchmark: msgpack vs direct WASM', () => {
  const ITERATIONS = 10000;
  const SIZES = [1, 2, 5, 10, 100];

  beforeAll(async () => {
    await BarretenbergSync.initSingleton();
  });

  it.each(SIZES)('benchmark with %p field elements', size => {
    const api = BarretenbergSync.getSingleton();
    const bbApi = api.bbApi;

    // Generate random inputs
    const inputs = Array(size)
      .fill(0)
      .map(() => FrBarretenberg.random());

    // Warm up phase (100 iterations each)
    for (let i = 0; i < 100; i++) {
      api.poseidon2Hash(inputs);
      bbApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    }

    // Benchmark old direct WASM API
    const directStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      api.poseidon2Hash(inputs);
    }
    const directTime = performance.now() - directStart;

    // Benchmark new msgpack API
    const msgpackStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      bbApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
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
    const directResult = api.poseidon2Hash(inputs);
    const msgpackResult = bbApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });
    expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());

    // Test always passes, this is just for measuring performance
    expect(true).toBe(true);
  });
});

describe('poseidon2Hash API equivalence', () => {
  const TEST_VECTORS = [1, 2, 3, 5, 10, 50, 100];
  const NUM_RANDOM_TESTS = 10;

  beforeAll(async () => {
    await BarretenbergSync.initSingleton();
  });

  it.each(TEST_VECTORS)('produces identical results for %p field elements', size => {
    const api = BarretenbergSync.getSingleton();
    const bbApi = api.bbApi;

    // Test with multiple random input vectors
    for (let test = 0; test < NUM_RANDOM_TESTS; test++) {
      const inputs = Array(size)
        .fill(0)
        .map(() => FrBarretenberg.random());

      const directResult = api.poseidon2Hash(inputs);
      const msgpackResult = bbApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('produces identical results for known test vectors', () => {
    const api = BarretenbergSync.getSingleton();
    const bbApi = api.bbApi;

    const zero = new FrBarretenberg(0n);
    const one = new FrBarretenberg(1n);
    const two = new FrBarretenberg(2n);
    const max = new FrBarretenberg(FrBarretenberg.MODULUS - 1n);

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
      const directResult = api.poseidon2Hash(inputs);
      const msgpackResult = bbApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('handles edge case: all zeros', () => {
    const api = BarretenbergSync.getSingleton();
    const bbApi = api.bbApi;

    const zero = new FrBarretenberg(0n);

    for (const size of [1, 10, 100]) {
      const inputs = Array(size).fill(zero);

      const directResult = api.poseidon2Hash(inputs);
      const msgpackResult = bbApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('handles edge case: all ones', () => {
    const api = BarretenbergSync.getSingleton();
    const bbApi = api.bbApi;

    const one = new FrBarretenberg(1n);

    for (const size of [1, 10, 100]) {
      const inputs = Array(size).fill(one);

      const directResult = api.poseidon2Hash(inputs);
      const msgpackResult = bbApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());
    }
  });

  it('handles edge case: maximum field elements', () => {
    const api = BarretenbergSync.getSingleton();
    const bbApi = api.bbApi;

    const maxElement = new FrBarretenberg(FrBarretenberg.MODULUS - 1n);

    for (const size of [1, 5, 10]) {
      const inputs = Array(size).fill(maxElement);

      const directResult = api.poseidon2Hash(inputs);
      const msgpackResult = bbApi.poseidon2Hash({ inputs: inputs.map(fr => fr.toBuffer()) });

      expect(Buffer.from(msgpackResult.hash)).toEqual(directResult.toBuffer());
    }
  });
});
