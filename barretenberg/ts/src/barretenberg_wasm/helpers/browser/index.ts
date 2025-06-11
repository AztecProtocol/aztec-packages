import { wrap } from 'comlink';

export function getSharedMemoryAvailable() {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  return typeof SharedArrayBuffer !== 'undefined' && globalScope.crossOriginIsolated;
}

export function getRemoteBarretenbergWasm<T>(worker: Worker) {
  return wrap<T>(worker);
}

export function getNumCpu() {
  return navigator.hardwareConcurrency;
}

export function threadLogger(): ((msg: string) => void) | undefined {
  return console.log;
}

export function killSelf() {
  self.close();
}

export function getAvailableThreads(logger: (msg: string) => void): number {
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return navigator.hardwareConcurrency;
  } else {
    logger(`Could not detect environment to query number of threads. Falling back to one thread.`);
    return 1;
  }
}

// Solution to async initialization of workers, taken from
// https://github.com/GoogleChromeLabs/comlink/issues/635#issuecomment-1598913044

/** The message expected by the `readinessListener`. */
export const Ready = { ready: true };

/** Listen for the readiness message from the Worker and call the `callback` once. */
export function readinessListener(worker: Worker, callback: () => void) {
  worker.addEventListener('message', function ready(event: MessageEvent<typeof Ready>) {
    if (!!event.data && event.data.ready === true) {
      worker.removeEventListener('message', ready);
      callback();
    }
  });
}
