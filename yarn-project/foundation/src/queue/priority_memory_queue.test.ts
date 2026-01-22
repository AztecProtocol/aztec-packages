import { createLogger } from '../log/pino-logger.js';
import { PriorityMemoryQueue } from './priority_memory_queue.js';

const logger = createLogger('test:priority-memory-queue');

describe('PriorityMemoryQueue', () => {
  let queue: PriorityMemoryQueue<number>;

  beforeEach(() => {
    queue = new PriorityMemoryQueue<number>((a, b) => a - b, logger);
  });

  it('returns items in the correct order', async () => {
    expect(queue.put(3)).toBeTruthy();
    expect(queue.put(1)).toBeTruthy();
    expect(queue.put(2)).toBeTruthy();

    expect(queue.length()).toEqual(3);

    expect(await queue.get()).toBe(1);
    expect(await queue.get()).toBe(2);
    expect(await queue.get()).toBe(3);

    expect(queue.length()).toEqual(0);

    await expect(queue.get(1)).rejects.toThrow(/timeout/i);
  });
});
