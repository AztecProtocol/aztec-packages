import { BackendType, Barretenberg, BarretenbergSync } from '@aztec/bb.js';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { parentPort, workerData } from 'node:worker_threads';

// Importing `./index.js` (which transitively imports `./msgpackr_fr_extension.js`) registers
// the msgpackr Fr extension for the bundled `Fr` class identity. Must happen before any
// `sendMessage` call. See msgpackr_fr_extension.ts for why.
import { TXEDispatcher, type TXEDispatcherOptions, type TXEForeignCallInput } from './index.js';

// Seed the bb.js singletons with WASM before the first runtime crypto call. `initSingleton`
// resolves to whichever backend the *first* call requests; subsequent calls (e.g. the implicit
// `Barretenberg.initSingleton()` inside `poseidon2Hash` from `@aztec/foundation/crypto`)
// join the same in-flight promise. Module init in `./index.js` doesn't perform crypto, so
// these fire-and-forget calls run before any oracle handler dispatches.
//
// Why: at high TXE_WORKERS counts each worker_thread is its own V8 isolate, so each used to
// spawn one Native-Unix-Socket bb (the async `Barretenberg` singleton, hit by poseidon) and
// one Native-SharedMemory bb (the sync `BarretenbergSync` singleton, hit by AES/Grumpkin/
// ECDSA/Pedersen/Schnorr/secp256k1). At w32 that was ~64 bb processes loading SRS in parallel,
// dominating warm-up and starving nargo's RPC connect timeout on heavier runs (w128 baseline:
// 4 tests fail with "Timeout waiting for bb socket connection"). TXE only needs hashing — no
// proving, no verification — so WASM is sufficient and `skipSrsInit: true` avoids the 256MB
// CRS load on the async path.
//
// `threads: 1` is critical: with threads > 1 the WASM backend spawns `threads - 1` extra
// worker_threads to parallelize, which OOM-kills the host at w64+ (each thread worker is its
// own V8 isolate). TXE does no concurrent hashing per worker, so single-threaded WASM is fine.
void Barretenberg.initSingleton({ backend: BackendType.Wasm, skipSrsInit: true, threads: 1 });
void BarretenbergSync.initSingleton({ backend: BackendType.Wasm });

if (!parentPort) {
  throw new Error('worker.ts must be loaded as a worker_thread');
}

const port = parentPort;
const logger: Logger = createLogger('txe:worker');

// The pool builds a template LMDB containing the 6 canonical protocol contracts + the
// SchnorrAccount artifact on the main thread and passes its path via `workerData`. The
// dispatcher clones the LMDB into a fresh per-worker store so this worker gets a writable copy
// already populated with all of them, without re-running artifact load / hash / write per
// worker. The SchnorrAccount class id is passed alongside so the worker can look up the
// pre-registered artifact when adding an account, instead of re-loading the 260 KiB JSON.
const dispatcherOpts: TXEDispatcherOptions = workerData?.contractStoreSourceDir
  ? {
      contractStoreSourceDir: workerData.contractStoreSourceDir,
      schnorrClassId: workerData.schnorrClassId,
    }
  : {};
const dispatcher = new TXEDispatcher(logger, dispatcherOpts);

interface ForeignCallRequest {
  type: 'foreign-call';
  requestId: number;
  callData: TXEForeignCallInput;
}

interface WarmMessage {
  type: 'warm';
}

interface DisposeSessionMessage {
  type: 'dispose-session';
  sessionId: number;
}

type IncomingMessage = ForeignCallRequest | WarmMessage | DisposeSessionMessage;

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

// Posted once as soon as the worker's module graph finishes loading. The pool measures the time
// between `new Worker()` and receiving this message to attribute V8 isolate startup + import
// graph compilation, which is otherwise opaque.
port.postMessage({ type: 'spawned' });

port.on('message', (msg: IncomingMessage) => {
  switch (msg.type) {
    case 'warm':
      void (async () => {
        const warmStart = Date.now();
        try {
          await dispatcher.warmUp();
          port.postMessage({ type: 'ready', warmMs: Date.now() - warmStart });
        } catch (err) {
          // Warm-up failures are surfaced as a 'ready' with an error so the pool can route
          // subsequent calls and fail them deterministically rather than hanging.
          port.postMessage({ type: 'ready', error: serializeError(err) });
        }
      })();
      return;
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
      // Fire-and-forget — the main thread doesn't wait for confirmation. Any error is logged on
      // the worker and the session is removed from the per-worker `sessions` Map regardless,
      // because leaving a dead session in the Map is worse than failing to flush an LMDB on close.
      void dispatcher.disposeSession(msg.sessionId).catch(err => logger.warn(`disposeSession failed`, err));
      return;
  }
});
