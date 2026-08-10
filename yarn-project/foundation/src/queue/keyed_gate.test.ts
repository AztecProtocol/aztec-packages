import { KeyedGate } from './keyed_gate.js';

describe('KeyedGate', () => {
  it('serializes access for the same key', async () => {
    const gate = new KeyedGate<string>();
    const releaseFirst = await gate.acquire('shared');
    let secondAcquired = false;

    const acquireSecond = async () => {
      const release = await gate.acquire('shared');
      secondAcquired = true;
      return release;
    };
    const secondRelease = acquireSecond();

    await Promise.resolve();
    expect(secondAcquired).toBe(false);

    releaseFirst();
    const releaseSecond = await secondRelease;
    expect(secondAcquired).toBe(true);
    releaseSecond();
  });

  it('allows concurrent access for different keys', async () => {
    const gate = new KeyedGate<string>();
    const releaseFirst = await gate.acquire('first');

    const releaseSecond = await gate.acquire('second');

    releaseFirst();
    releaseSecond();
  });

  it('does not release more than once', async () => {
    const gate = new KeyedGate<string>();
    const releaseFirst = await gate.acquire('shared');
    let secondAcquired = false;
    let thirdAcquired = false;

    const acquireNext = async (onAcquire: () => void) => {
      const release = await gate.acquire('shared');
      onAcquire();
      return release;
    };
    const secondRelease = acquireNext(() => {
      secondAcquired = true;
    });
    const thirdRelease = acquireNext(() => {
      thirdAcquired = true;
    });

    releaseFirst();
    releaseFirst();
    const releaseSecond = await secondRelease;
    expect(secondAcquired).toBe(true);
    expect(thirdAcquired).toBe(false);

    releaseSecond();
    const releaseThird = await thirdRelease;
    expect(thirdAcquired).toBe(true);
    releaseThird();
  });
});
