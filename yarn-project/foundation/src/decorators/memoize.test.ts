import { sleep } from '../sleep/index.js';
import { memoize } from './memoize.js';

class Memoized {
  public readonly counters: Record<string, number> = {};

  @memoize
  voidPublic() {
    this.inc('voidPublic');
  }

  @memoize
  synchPublic() {
    this.inc('synchPublic');
    return this.counters['synchPublic'] + 10;
  }

  callSyncPrivate() {
    this.synchPrivate();
    this.synchPrivate();
  }

  @memoize
  private synchPrivate() {
    this.inc('synchPrivate');
    return this.counters['synchPrivate'] + 20;
  }

  @memoize
  async asyncPublic() {
    this.inc('asyncPublic');
    await sleep(1);
    return this.counters['asyncPublic'] + 30;
  }

  async callAsyncPrivate() {
    await this.asyncPrivate();
    await this.asyncPrivate();
  }

  @memoize
  private async asyncPrivate() {
    this.inc('asyncPrivate');
    await sleep(1);
    return this.counters['asyncPrivate'] + 40;
  }

  @memoize
  async asyncVoid() {
    this.inc('asyncVoid');
    await sleep(1);
  }

  private inc(name: string) {
    if (!(name in this.counters)) {
      this.counters[name] = 0;
    }
    this.counters[name]++;
  }
}

describe('memoize', () => {
  let memoized: Memoized;

  beforeEach(() => {
    memoized = new Memoized();
  });

  it('memoizes public void', () => {
    memoized.voidPublic();
    memoized.voidPublic();
    expect(memoized.counters['voidPublic']).toBe(1);
  });

  it('memoizes public synchronous', () => {
    expect(memoized.synchPublic()).toBe(11);
    expect(memoized.synchPublic()).toBe(11);
    expect(memoized.counters['synchPublic']).toBe(1);
  });

  it('memoizes private synchronous', () => {
    memoized.callSyncPrivate();
    memoized.callSyncPrivate();
    expect(memoized.counters['synchPrivate']).toBe(1);
  });

  it('memoizes public asynchronous', async () => {
    expect(await memoized.asyncPublic()).toBe(31);
    expect(await memoized.asyncPublic()).toBe(31);
    expect(memoized.counters['asyncPublic']).toBe(1);
  });

  it('memoizes private asynchronous', async () => {
    await memoized.callAsyncPrivate();
    await memoized.callAsyncPrivate();
    expect(memoized.counters['asyncPrivate']).toBe(1);
  });

  it('memoizes void asynchronous', async () => {
    await memoized.asyncVoid();
    await memoized.asyncVoid();
    expect(memoized.counters['asyncVoid']).toBe(1);
  });
});
