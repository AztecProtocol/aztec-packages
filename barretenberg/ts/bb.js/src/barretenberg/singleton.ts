const DESTROYED_WHILE_CREATING = 'Singleton was destroyed while it was being created';

/** An instance a {@link ReplaceableSingleton} can hold. */
export interface SingletonInstance {
  isAlive(): boolean;
  destroy(): void | Promise<void>;
}

/**
 * Holds a lazily created, process-wide instance. Concurrent `init` calls share one creation, a failed
 * creation is retried by the next `init`, and an instance that is no longer alive is destroyed and
 * replaced by the next `init`, using the factory that created it.
 */
export class ReplaceableSingleton<T extends SingletonInstance> {
  private instance?: T;
  /** The fill that produced, or is producing, the held instance. Concurrent `init` calls await it. */
  private pending?: Promise<T>;
  /** The factory that created the held instance, kept to replace it if it dies. */
  private factory?: () => Promise<T>;
  /** Incremented by `take()`, so a fill in progress can tell it was superseded. */
  private takeCount = 0;

  /**
   * Returns the held instance if it is alive. Otherwise destroys a dead one and returns a new
   * instance, created by the factory of the instance it replaces, or by `create` if none is held.
   */
  async init(create: () => Promise<T>): Promise<T> {
    const held = this.instance;
    if (held?.isAlive()) {
      return held;
    }
    if (held || !this.pending) {
      this.instance = undefined;
      const pending = this.fill(held, this.factory ?? create);
      this.pending = pending;
      // The next init retries a failed fill, unless take() has replaced it since.
      void pending.catch(() => {
        if (this.pending === pending) {
          this.pending = undefined;
        }
      });
    }
    return await this.pending;
  }

  /** The instance from the last completed `init`, if any. */
  get(): T | undefined {
    return this.instance;
  }

  /**
   * Clears the held instance and returns it, for the caller to destroy. An `init` still in progress rejects, and an
   * instance whose creation completes afterwards is destroyed.
   */
  take(): T | undefined {
    const instance = this.instance;
    this.instance = undefined;
    this.pending = undefined;
    this.factory = undefined;
    this.takeCount++;
    return instance;
  }

  /**
   * Destroys `dead`, if given, then creates the instance that fills the singleton. Tearing down and creating in one
   * operation means every concurrent caller gets an instance created after the dead one is gone.
   */
  private async fill(dead: T | undefined, create: () => Promise<T>): Promise<T> {
    const takeCount = this.takeCount;
    if (dead) {
      await dead.destroy();
    }
    if (this.takeCount !== takeCount) {
      throw new Error(DESTROYED_WHILE_CREATING);
    }
    const instance = await create();
    if (this.takeCount !== takeCount) {
      await instance.destroy();
      throw new Error(DESTROYED_WHILE_CREATING);
    }
    this.instance = instance;
    this.factory = create;
    return instance;
  }
}
