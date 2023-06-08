import { CircuitsWasm } from './circuits_wasm.js';

describe('basic barretenberg smoke test', () => {
  const wasm: CircuitsWasm = new CircuitsWasm();

  beforeAll(async () => {
    await wasm.init();
  });

  it('should new malloc, transfer and slice mem', () => {
    const length = 1024;
    const ptr = wasm.call('bbmalloc', length);
    const buf = Buffer.alloc(length, 128);
    wasm.writeMemory(ptr, buf);
    wasm.call('bbfree', ptr);
    const result = Buffer.from(wasm.getMemorySlice(ptr, ptr + length));
    expect(result).toStrictEqual(buf);
  });
});
