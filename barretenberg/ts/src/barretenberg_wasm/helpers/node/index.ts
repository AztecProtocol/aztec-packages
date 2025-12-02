import { Worker, parentPort } from 'worker_threads';
import os from 'os';
import { wrap } from 'comlink';
import { nodeEndpoint } from './node_endpoint.js';
import { writeSync } from 'fs';

export function getSharedMemoryAvailable() {
  return true;
}

/**
 * Comlink allows you to produce a Proxy to the worker, enabling you to call methods as if it were a normal class.
 * Note we give it the type information it needs so the returned Proxy object looks like that type.
 * Node has a different implementation, needing this nodeEndpoint wrapper, hence this function exists here.
 */
export function getRemoteBarretenbergWasm<T>(worker: Worker) {
  return wrap<T>(nodeEndpoint(worker));
}

/**
 * Returns number of cpus as reported by the system, unless overriden by HARDWARE_CONCURRENCY env var.
 */
export function getNumCpu() {
  return +process.env.HARDWARE_CONCURRENCY! || os.cpus().length;
}

/**
 * Returns a logger function for worker threads.
 * When a custom logger is provided, posts messages back to the main thread.
 * Otherwise, writes directly to stdout.
 */
export function threadLogger(useCustomLogger: boolean): ((msg: string) => void) | undefined {
  if (useCustomLogger) {
    return (msg: string) => {
      if (parentPort) {
        parentPort.postMessage({ type: 'log', msg });
      }
    };
  }
  // Write directly to stdout when no custom logger is provided
  return (msg: string) => {
    writeSync(1, msg + '\n');
  };
}

export function killSelf(): never {
  // Extordinarily hard process termination. Due to how parent threads block on child threads etc, even process.exit
  // doesn't seem to be able to abort the process. The following does.
  process.kill(process.pid);
  throw new Error();
}

export function getAvailableThreads(logger: (msg: string) => void): number {
  try {
    return os.cpus().length;
  } catch (e: any) {
    logger(
      `Could not detect environment to query number of threads. Falling back to one thread. Error: ${e.message ?? e}`,
    );
    return 1;
  }
}
