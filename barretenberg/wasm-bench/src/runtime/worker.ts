/**
 * Web Worker entry: instantiates the wasm against the shared memory the main thread sent us,
 * then waits for `wasi_thread_start(tid, arg)` calls from the main side and runs them on this
 * worker's wasm instance.
 *
 * Mirrors `barretenberg_wasm_thread` from bb.js but drops Comlink, the bb.js logger plumbing,
 * and the cbind call path (workers never see bbapi calls — those go through the main instance).
 */

import { buildWorkerImports } from './wasi.js';

type ThreadStartMessage = {
  kind: 'init';
  module: WebAssembly.Module;
  memory: WebAssembly.Memory;
};

type ThreadCallMessage = {
  kind: 'start';
  tid: number;
  arg: number;
};

let instance: WebAssembly.Instance | undefined;
let memory: WebAssembly.Memory | undefined;

(self as any).postMessage({ kind: 'log', msg: 'worker entry executed' });

self.onmessage = async (event: MessageEvent<ThreadStartMessage | ThreadCallMessage>) => {
  const msg = event.data;
  try {
    if (msg.kind === 'init') {
      (self as any).postMessage({ kind: 'log', msg: 'worker received init' });
      memory = msg.memory;
      const imports = buildWorkerImports({
        memory,
        getMemoryBytes: () => new Uint8Array(memory!.buffer),
        logger: (m) => (self as any).postMessage({ kind: 'log', msg: m }),
      });
      instance = await WebAssembly.instantiate(msg.module, imports as any);
      (self as any).postMessage({ kind: 'ready' });
      return;
    }
    if (msg.kind === 'start' && instance) {
      try {
        (instance.exports['wasi_thread_start'] as (tid: number, arg: number) => void)(msg.tid, msg.arg);
      } catch (e) {
        (self as any).postMessage({ kind: 'error', msg: e instanceof Error ? e.message : String(e) });
      }
    }
  } catch (e) {
    (self as any).postMessage({
      kind: 'error',
      msg: `worker onmessage threw: ${e instanceof Error ? e.message + '\n' + (e.stack ?? '') : String(e)}`,
    });
  }
};

self.addEventListener('error', (e) => {
  (self as any).postMessage({ kind: 'error', msg: `worker uncaught: ${e.message} ${e.filename}:${e.lineno}` });
});
