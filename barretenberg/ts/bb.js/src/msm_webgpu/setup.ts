// One-stop helper for wiring the WebGPU MSM bridge into a bb.js
// Barretenberg instance. Call this from the main browser thread BEFORE
// the worker instantiates the WASM module:
//
//   import { setupWebGpuMsmBridge } from '@aztec/bb.js/msm-webgpu';
//   const handle = await setupWebGpuMsmBridge(worker);
//   await worker.start();   // worker's WASM init now sees the bridge
//
// The helper:
//   1. Allocates a shared control buffer (CTRL_BYTES).
//   2. Constructs the main-thread `WebGpuMsmHost`.
//   3. Posts the control SAB into the worker (so the worker-side stub
//      can pick it up and install its env imports).
//   4. Wires `worker.onmessage` to dispatch `'msm_request'` events
//      into the host.
//
// The worker-side wiring is split out into `installWorkerStub` so test
// harnesses (which run the "worker side" in-thread) can invoke it
// directly.

import { createControlBuffer } from './bridge/protocol.js';
import { WebGpuMsmHost } from './bridge/main.js';
import { WebGpuMsmWorkerStub } from './bridge/worker_stub.js';

export interface WebGpuBridgeHandle {
  /** Control SAB shared between worker and host. */
  controlSab: SharedArrayBuffer;
  /** Main-thread host driving the GPU. */
  host: WebGpuMsmHost;
  /** Detach handlers + destroy the host (its GPUDevice and SRS point pool). */
  destroy: () => Promise<void>;
}

/**
 * Main-thread side. Spawn a `WebGpuMsmHost`, post the control SAB to
 * `worker`, and dispatch wake messages.
 *
 * The worker MUST handle the 'webgpu-control-sab' message and call
 * `installWorkerStub(...)` with the payload before instantiating
 * its WASM module — otherwise the WASM hooks won't find the bridge.
 */
export async function setupWebGpuMsmBridge(worker: Worker): Promise<WebGpuBridgeHandle> {
  const controlSab = createControlBuffer();
  const host = new WebGpuMsmHost(controlSab);

  // Hand the control SAB to the worker before its WASM module is
  // instantiated. The worker-side wiring listens for this message
  // and constructs a WebGpuMsmWorkerStub before doing anything else.
  worker.postMessage({ kind: 'webgpu-control-sab', sab: controlSab });

  const messageHandler = (e: MessageEvent) => {
    // The worker stub posts the literal string 'msm_request' (see
    // worker_stub.ts:signalAndWait). Anything else is unrelated.
    if (e.data === 'msm_request') {
      void host.handleMessage(e.data);
    } else if (e.data && typeof e.data === 'object' && e.data.kind === 'webgpu-wasm-memory') {
      // The worker posts its WASM memory back to us once it's
      // instantiated. We need this to read out request payloads.
      host.setWasmMemory(e.data.memory);
    }
  };
  worker.addEventListener('message', messageHandler);

  // Decoupled page hook (same pattern as the bridge's other `__bridge_*` globals,
  // so serve.ts can call it without importing this module and coupling the bundle):
  // reset the GPU bridge to a clean post-publish state between proves, letting one
  // warm GPU backend prove many different chonk flows correctly. Returns a promise.
  const resetHook = (): Promise<void> => host.reset();
  (globalThis as any).__bridge_reset = resetHook;

  const destroy = async () => {
    worker.removeEventListener('message', messageHandler);
    // Clear our hook only if it's still ours (a newer bridge may have replaced it).
    // host.reset() is a no-op after destroy anyway, so a stale hook is harmless.
    if ((globalThis as any).__bridge_reset === resetHook) {
      (globalThis as any).__bridge_reset = undefined;
    }
    await host.destroy();
  };
  return { controlSab, host, destroy };
}

/**
 * Worker-thread side. Call this inside the worker's `onmessage` for
 * the `'webgpu-control-sab'` event. The returned stub's
 * `getEnvImports()` should be merged into the wasm `env` via
 * `wasm.setExtraEnvImports(stub.getEnvImports())` before
 * `WebAssembly.instantiate` runs.
 */
export function installWorkerStub(controlSab: SharedArrayBuffer, post: (msg: string) => void): WebGpuMsmWorkerStub {
  return new WebGpuMsmWorkerStub(controlSab, post);
}
