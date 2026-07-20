import { BackendType, Barretenberg, BarretenbergSync } from '@aztec/bb.js';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { parentPort, workerData } from 'node:worker_threads';

// Importing `./index.js` registers the msgpackr Fr extension transitively (via
// ./msgpackr_fr_extension.js); this must happen before any `sendMessage` call.
import { TXEDispatcher, type TXEDispatcherOptions, type TXEForeignCallInput, activeSessionCount } from './index.js';

// Seed both bb.js singletons with the WASM backend before any crypto call. `initSingleton`
// binds the singleton to whichever backend the first call requests, so this pre-empts the
// implicit `Barretenberg.initSingleton()` inside `poseidon2Hash` from `@aztec/foundation/crypto`.
// TXE only needs hashing (no proving, no verification), so WASM is sufficient and
// `skipSrsInit: true` skips the CRS load. `threads: 1` keeps the WASM backend on a single
// thread — additional threads would each spawn a nested worker_thread, multiplying memory cost
// per pool worker.
void Barretenberg.initSingleton({ backend: BackendType.Wasm, skipSrsInit: true, threads: 1 });
void BarretenbergSync.initSingleton({ backend: BackendType.Wasm });

if (!parentPort) {
  throw new Error('worker.ts must be loaded as a worker_thread');
}

const port = parentPort;
const logger: Logger = createLogger('txe:worker');

// The pool builds a template LMDB containing the protocol contracts + the SchnorrAccount
// artifact on the main thread and passes its data dir via `workerData`. The dispatcher clones
// that LMDB into a per-worker store on first use, so this worker gets a writable copy already
// populated.
const dispatcherOpts: TXEDispatcherOptions = {
  contractStoreSourceDir: workerData.contractStoreSourceDir,
  schnorrClassId: workerData.schnorrClassId,
};
const dispatcher = new TXEDispatcher(logger, dispatcherOpts);

interface ForeignCallRequest {
  type: 'foreign-call';
  requestId: number;
  callData: TXEForeignCallInput;
}

interface DisposeSessionMessage {
  type: 'dispose-session';
  sessionId: number;
}

type IncomingMessage = ForeignCallRequest | DisposeSessionMessage;

interface SerializedError {
  message: string;
  name?: string;
  stack?: string;
}

function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  return { message: String(err) };
}

// Periodic memstat for diagnostic builds — set TXE_WORKER_MEMSTAT=1 to enable. Posts JS-heap
// breakdown + active-session count back to the dispatcher so we can attribute RSS growth
// between V8 heap (would show in heapUsed) and native (LMDB / world-state / WASM).
if (process.env.TXE_WORKER_MEMSTAT === '1') {
  setInterval(() => {
    const m = process.memoryUsage();
    port.postMessage({
      type: 'memstat',
      sessions: activeSessionCount(),
      rss: m.rss,
      heapTotal: m.heapTotal,
      heapUsed: m.heapUsed,
      external: m.external,
      arrayBuffers: m.arrayBuffers,
    });
  }, 2000).unref();
}

port.on('message', (msg: IncomingMessage) => {
  switch (msg.type) {
    case 'foreign-call':
      void (async () => {
        try {
          const value = await dispatcher.resolve_foreign_call(msg.callData);
          port.postMessage({ type: 'result', requestId: msg.requestId, ok: true, value });
        } catch (err) {
          port.postMessage({ type: 'result', requestId: msg.requestId, ok: false, error: serializeError(err) });
        }
      })();
      return;
    case 'dispose-session':
      // Fire-and-forget; the main thread does not wait for confirmation.
      void dispatcher.disposeSession(msg.sessionId).catch(err => logger.warn(`disposeSession failed`, err));
      return;
  }
});
