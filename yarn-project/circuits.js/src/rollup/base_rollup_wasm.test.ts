import { PreviousKernelData } from '../index.js';
import { uint8ArrayToNum } from '../utils/serialize.js';
import { CircuitsWasm } from '../wasm/circuits_wasm.js';

describe('base rollup wasm integration test', () => {
  const wasm: CircuitsWasm = new CircuitsWasm();

  beforeAll(async () => {
    await wasm.init();
  });

  it('should new malloc, transfer and slice mem', async () => {
    const ptr = wasm.call('bbmalloc', 4);
    const data = await wasm.asyncCall('private_kernel__dummy_previous_kernel', ptr);
    const outputBufSize = uint8ArrayToNum(wasm.getMemorySlice(ptr, ptr + 4));
    console.log(`size ${outputBufSize}`);
    wasm.call('bbfree', ptr);
    const result = Buffer.from(wasm.getMemorySlice(data, data + outputBufSize));
    const kernel = PreviousKernelData.fromBuffer(result);
    console.log(`kernel `, kernel);
  });
});
