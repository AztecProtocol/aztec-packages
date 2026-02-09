import { retryUntil } from '../retry/index.js';
import { sleep } from '../sleep/index.js';
import { TestDateProvider } from './date.js';

describe('TestDateProvider', () => {
  let dateProvider: TestDateProvider;

  beforeEach(() => {
    dateProvider = new TestDateProvider();
  });

  afterEach(() => {
    dateProvider.clearPendingTimeouts();
  });

  describe('now', () => {
    it('should return the current datetime', () => {
      const currentTime = Date.now();
      const result = dateProvider.now();
      expect(result).toBeGreaterThanOrEqual(currentTime);
      expect(result).toBeLessThan(currentTime + 100);
    });

    it('should return the overridden datetime', () => {
      const overriddenTime = Date.now() + 1000;
      dateProvider.setTime(overriddenTime);
      const result = dateProvider.now();
      expect(result).toBeGreaterThanOrEqual(overriddenTime);
      expect(result).toBeLessThan(overriddenTime + 100);
    });

    it('should keep ticking after overriding', async () => {
      const overriddenTime = Date.now() + 1000;
      dateProvider.setTime(overriddenTime);
      await sleep(510);
      const result = dateProvider.now();
      expect(result).toBeGreaterThanOrEqual(overriddenTime + 500);
      expect(result).toBeLessThan(overriddenTime + 600);
    });
  });

  describe('createTimeoutSignal', () => {
    it('should not abort signal before deadline', () => {
      const baseTime = Date.now();
      dateProvider.setTime(baseTime);

      const signal = dateProvider.createTimeoutSignal(1000);

      expect(signal.aborted).toBe(false);
    });

    it('should abort signal when setTime advances past deadline', () => {
      const baseTime = Date.now();
      dateProvider.setTime(baseTime);

      const signal = dateProvider.createTimeoutSignal(1000);
      expect(signal.aborted).toBe(false);

      // Advance time past the deadline
      dateProvider.setTime(baseTime + 1001);

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(DOMException);
      expect(signal.reason.name).toBe('TimeoutError');
    });

    it('should abort immediately when ms <= 0', () => {
      const signal = dateProvider.createTimeoutSignal(0);

      expect(signal.aborted).toBe(true);
      expect(signal.reason.name).toBe('TimeoutError');
    });

    it('should abort multiple signals in deadline order when time advances', () => {
      const baseTime = Date.now();
      dateProvider.setTime(baseTime);

      const signal1 = dateProvider.createTimeoutSignal(1000);
      const signal2 = dateProvider.createTimeoutSignal(500);
      const signal3 = dateProvider.createTimeoutSignal(2000);

      expect(signal1.aborted).toBe(false);
      expect(signal2.aborted).toBe(false);
      expect(signal3.aborted).toBe(false);

      // Advance past signal2's deadline only
      dateProvider.setTime(baseTime + 600);

      expect(signal1.aborted).toBe(false);
      expect(signal2.aborted).toBe(true);
      expect(signal3.aborted).toBe(false);

      // Advance past signal1's deadline
      dateProvider.setTime(baseTime + 1500);

      expect(signal1.aborted).toBe(true);
      expect(signal3.aborted).toBe(false);

      // Advance past signal3's deadline
      dateProvider.setTime(baseTime + 2500);

      expect(signal3.aborted).toBe(true);
    });
  });

  describe('sleep', () => {
    it('should resolve immediately when ms <= 0', async () => {
      await expect(dateProvider.sleep(0)).resolves.toBeUndefined();
    });

    it('should resolve when setTime advances past deadline', async () => {
      const baseTime = Date.now();
      dateProvider.setTime(baseTime);

      const sleepPromise = dateProvider.sleep(1000);

      // Advance time past the deadline
      dateProvider.setTime(baseTime + 1001);

      await expect(sleepPromise).resolves.toBeUndefined();
    });

    it('should resolve multiple sleeps in deadline order when time advances', async () => {
      const baseTime = Date.now();
      dateProvider.setTime(baseTime);

      const resolveOrder: number[] = [];

      const sleep1 = dateProvider.sleep(1000).then(() => resolveOrder.push(1));
      const sleep2 = dateProvider.sleep(500).then(() => resolveOrder.push(2));
      const sleep3 = dateProvider.sleep(2000).then(() => resolveOrder.push(3));

      // Advance past all deadlines at once
      dateProvider.setTime(baseTime + 3000);

      await Promise.all([sleep1, sleep2, sleep3]);

      // Should resolve in deadline order: sleep2 (500ms), sleep1 (1000ms), sleep3 (2000ms)
      expect(resolveOrder).toEqual([2, 1, 3]);
    });
  });

  describe('clearPendingTimeouts', () => {
    it('should clear pending timeouts so they never abort', async () => {
      const baseTime = Date.now();
      dateProvider.setTime(baseTime);

      const signal = dateProvider.createTimeoutSignal(1000);

      expect(signal.aborted).toBe(false);

      dateProvider.clearPendingTimeouts();

      const aborted = await retryUntil(() => signal.aborted, 'wait for abort', 0.1, 0.01);
      expect(aborted).toBe(true);
    });
  });

  describe('combined timeout and sleep behavior', () => {
    it('should handle interleaved timeouts and sleeps', async () => {
      const baseTime = Date.now();
      dateProvider.setTime(baseTime);

      const signal1 = dateProvider.createTimeoutSignal(500);
      const sleep1Promise = dateProvider.sleep(750);
      const signal2 = dateProvider.createTimeoutSignal(1000);

      // Advance to 600ms - only signal1 should abort
      dateProvider.setTime(baseTime + 600);

      expect(signal1.aborted).toBe(true);
      expect(signal2.aborted).toBe(false);

      // Advance to 800ms - sleep1 should resolve
      dateProvider.setTime(baseTime + 800);
      await sleep1Promise;

      expect(signal2.aborted).toBe(false);

      // Advance to 1100ms - signal2 should abort
      dateProvider.setTime(baseTime + 1100);

      expect(signal2.aborted).toBe(true);
    });
  });
});
