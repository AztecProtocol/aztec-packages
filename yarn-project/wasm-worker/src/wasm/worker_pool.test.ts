import { WorkerPool } from './worker_pool.js';
import { WasmModule } from './wasm_module.js';

describe('wasm worker pool', () => {
  it('should call worker', async () => {
    const pool = await WorkerPool.new(await WasmModule.new(), 4);
    try {
      const memSizeWasm0 = await pool.workers[0].memSize();
      expect(memSizeWasm0).toBeGreaterThan(0);
    } finally {
      await pool.destroy();
    }
  });
});
