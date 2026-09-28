import { ReplaceableSingleton } from './singleton.js';

class FakeInstance {
  alive = true;
  destroyCount = 0;
  /** When set, destroy() completes only once this resolves. */
  teardown?: Promise<void>;

  constructor(readonly createdBy: string = 'default') {}

  isAlive() {
    return this.alive;
  }

  destroy(): void | Promise<void> {
    this.alive = false;
    this.destroyCount++;
    return this.teardown;
  }
}

function factory(name: string) {
  const created: FakeInstance[] = [];
  const create = () => {
    const instance = new FakeInstance(name);
    created.push(instance);
    return Promise.resolve(instance);
  };
  return { create, created };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

describe('ReplaceableSingleton', () => {
  it('shares one creation between concurrent callers', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    const { create, created } = factory('a');
    const [a, b] = await Promise.all([singleton.init(create), singleton.init(create)]);
    expect(a).toBe(b);
    expect(created).toHaveLength(1);
    expect(singleton.get()).toBe(a);
  });

  it('keeps an instance that is alive and ignores later factories', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    const first = await singleton.init(factory('a').create);
    const second = await singleton.init(factory('b').create);
    expect(second).toBe(first);
  });

  it('retries after a failed creation', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    await expect(singleton.init(() => Promise.reject(new Error('spawn failed')))).rejects.toThrow('spawn failed');
    expect(singleton.get()).toBeUndefined();
    const instance = await singleton.init(factory('a').create);
    expect(singleton.get()).toBe(instance);
  });

  it('retries after a creation that throws synchronously', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    const throwing = (): Promise<FakeInstance> => {
      throw new Error('bad options');
    };
    await expect(singleton.init(throwing)).rejects.toThrow('bad options');
    const instance = await singleton.init(factory('a').create);
    expect(singleton.get()).toBe(instance);
  });

  it('destroys a dead instance once and replaces it using the factory that created it', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    const dead = await singleton.init(factory('original').create);
    dead.alive = false;
    const replacement = await singleton.init(factory('other').create);
    expect(replacement).not.toBe(dead);
    expect(replacement.createdBy).toBe('original');
    expect(dead.destroyCount).toBe(1);
    expect(singleton.get()).toBe(replacement);
  });

  it('shares one replacement between concurrent callers', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    const original = factory('original');
    const dead = await singleton.init(original.create);
    dead.alive = false;
    const [a, b] = await Promise.all([singleton.init(original.create), singleton.init(original.create)]);
    expect(a).toBe(b);
    expect(a).not.toBe(dead);
    expect(original.created).toHaveLength(2);
    expect(dead.destroyCount).toBe(1);
  });

  it('creates the replacement only once the dead instance is torn down, for every concurrent caller', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    const original = factory('original');
    const dead = await singleton.init(original.create);
    const teardown = deferred<void>();
    dead.teardown = teardown.promise;
    dead.alive = false;

    const first = singleton.init(original.create);
    const second = singleton.init(original.create);
    await new Promise(resolve => setImmediate(resolve));
    expect(original.created).toHaveLength(1);

    teardown.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(original.created).toHaveLength(2);
  });

  it('does not hold the dead instance while its replacement is being created', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    const next = deferred<FakeInstance>();
    let calls = 0;
    const create = () => (calls++ === 0 ? Promise.resolve(new FakeInstance()) : next.promise);
    const dead = await singleton.init(create);
    dead.alive = false;

    const replacing = singleton.init(create);
    await Promise.resolve();
    expect(singleton.get()).toBeUndefined();

    const replacement = new FakeInstance();
    next.resolve(replacement);
    expect(await replacing).toBe(replacement);
    expect(singleton.get()).toBe(replacement);
  });

  it('take clears the held instance and forgets its factory', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    const instance = await singleton.init(factory('a').create);
    expect(singleton.take()).toBe(instance);
    expect(singleton.get()).toBeUndefined();
    const next = await singleton.init(factory('b').create);
    expect(next).not.toBe(instance);
    expect(next.createdBy).toBe('b');
  });

  it('does not create a replacement when take runs while the dead instance is being destroyed', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    const original = factory('original');
    const teardown = deferred<void>();
    const dead = await singleton.init(original.create);
    dead.teardown = teardown.promise;
    dead.alive = false;

    const replacing = singleton.init(original.create);
    expect(singleton.take()).toBeUndefined();
    teardown.resolve();

    await expect(replacing).rejects.toThrow('destroyed while it was being created');
    expect(original.created).toHaveLength(1);
    expect(singleton.get()).toBeUndefined();
  });

  it('destroys an instance whose creation completes after take', async () => {
    const singleton = new ReplaceableSingleton<FakeInstance>();
    const creation = deferred<FakeInstance>();
    const initializing = singleton.init(() => creation.promise);
    expect(singleton.take()).toBeUndefined();

    const late = new FakeInstance();
    creation.resolve(late);
    await expect(initializing).rejects.toThrow('destroyed while it was being created');
    expect(late.destroyCount).toBe(1);
    expect(singleton.get()).toBeUndefined();
  });
});
