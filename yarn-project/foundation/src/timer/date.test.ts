import { sleep } from '../sleep/index.js';
import { TestDateProvider } from './date.js';

describe('TestDateProvider', () => {
  let dateProvider: TestDateProvider;
  beforeEach(() => {
    dateProvider = new TestDateProvider();
  });

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
