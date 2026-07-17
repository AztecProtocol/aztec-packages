import { SqlitePoolBusyError, SqliteWebLocksUnavailableError } from './errors.js';

export const DEFAULT_SAH_POOL_DIRECTORY = '.aztec-kv';

const WEB_LOCK_PREFIX = 'aztec.sqlite-opfs.pool:';

export interface PoolLockLease {
  release(): Promise<void>;
}

export function normalizePoolDirectory(poolDirectory?: string): string {
  const path = poolDirectory
    ?.split('/')
    .filter(segment => segment.length > 0)
    .join('/');
  return path || DEFAULT_SAH_POOL_DIRECTORY;
}

export async function acquirePoolLock(poolDirectory?: string): Promise<PoolLockLease> {
  if (!navigator.locks) {
    throw new SqliteWebLocksUnavailableError();
  }
  const normalizedDirectory = normalizePoolDirectory(poolDirectory);
  const acquired = Promise.withResolvers<Lock | null>();
  const hold = Promise.withResolvers<void>();
  const request = navigator.locks.request(
    `${WEB_LOCK_PREFIX}${normalizedDirectory}`,
    { mode: 'exclusive', ifAvailable: true },
    async lock => {
      acquired.resolve(lock);
      if (lock) {
        await hold.promise;
      }
    },
  );
  request.catch(acquired.reject);

  if (!(await acquired.promise)) {
    await request;
    throw new SqlitePoolBusyError(normalizedDirectory);
  }

  let released = false;
  return {
    release: async () => {
      if (!released) {
        released = true;
        hold.resolve();
      }
      await request;
    },
  };
}

export async function withPoolLock<T>(poolDirectory: string, callback: () => Promise<T>): Promise<T> {
  const lease = await acquirePoolLock(poolDirectory);
  try {
    return await callback();
  } finally {
    await lease.release();
  }
}
