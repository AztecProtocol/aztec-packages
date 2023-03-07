import { createWorker } from './worker_factory.js';
import { Transfer } from '../transport/index.js';

describe('wasm worker', () => {
  it('should call worker', async () => {
    const barretenbergWorker = await createWorker('test');

    try {
      const initialMemSize = await barretenbergWorker.memSize();
      const ptr = await barretenbergWorker.call('bbmalloc', [1024 * 1024 * 32]);
      expect(await barretenbergWorker.memSize()).toBeGreaterThan(initialMemSize);

      const data = Buffer.alloc(1024, 127);
      await barretenbergWorker.transferToHeap(data, ptr);
      const result = Buffer.from(await barretenbergWorker.sliceMemory(ptr, ptr + data.length));
      expect(result).toEqual(data);

      await barretenbergWorker.transferToHeap(Transfer(data, [data.buffer]), ptr);
      expect(data.length).toBe(0);

      await barretenbergWorker.call('bbfree', ptr);
    } finally {
      await barretenbergWorker.destroyWorker();
    }
  });
});
