import { CircuitsWasm } from '../wasm/circuits_wasm.js';
import { getDummyPreviousKernelData } from './kernel.js';

describe('abis wasm bindings', () => {
  let wasm: CircuitsWasm;
  beforeEach(async () => {
    wasm = await CircuitsWasm.new();
  });

  it('gets dummy kernel data', async () => {
    await expect(getDummyPreviousKernelData(wasm)).resolves.toBeDefined();
  });
});
