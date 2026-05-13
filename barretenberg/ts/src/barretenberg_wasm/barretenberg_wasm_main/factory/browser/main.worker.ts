// IMPORTANT: this file deliberately has NO static `import` statements.
// In ES modules, static imports are resolved and executed BEFORE the
// module body — so if we put `self.addEventListener('error', …)` next
// to a static `import { … } from '…'`, the listener never gets a
// chance to register when an import fails to fetch/parse/link. The
// parent then sees an opaque `error` event with `{message, filename,
// lineno}` all stripped to undefined (cross-origin info-hiding), and
// the page hangs with no diagnostic.
//
// By doing everything via dynamic `import()` inside an async IIFE, we
// register the error/unhandledrejection handlers synchronously at the
// top of module evaluation. Any import or instantiation failure
// becomes either an `error` event or a rejected promise that we can
// forward to the parent as a `worker-error` message.

self.addEventListener('error', (e: ErrorEvent) => {
  try {
    self.postMessage({
      type: 'worker-error',
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      errorString: String(e.error),
      stack: e.error instanceof Error ? e.error.stack : undefined,
    });
  } catch {
    // postMessage itself may fail if the worker is already torn down;
    // nothing useful we can do here.
  }
});
self.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  try {
    self.postMessage({
      type: 'worker-unhandled-rejection',
      reasonString: String(e.reason),
      stack: e.reason instanceof Error ? e.reason.stack : undefined,
    });
  } catch {
    // ignore
  }
});

void (async () => {
  try {
    const { expose } = await import('comlink');
    const { BarretenbergWasmMain } = await import('../../index.js');
    const { Ready } = await import('../../../helpers/browser/index.js');

    const wasm = new BarretenbergWasmMain();

    // Default stubs for the BBERG_WEBGPU_MSM_HOOK imports. These
    // satisfy WASM instantiation when the WebGPU bridge isn't wired
    // up (e.g. the MSM dev page that calls `bb_native_pippenger_bn254`
    // directly and never goes through `batch_multi_scalar_mul`'s hook
    // path). Callers that DO want the bridge can override these via
    // setExtraEnvImports after construction and before init.
    /* eslint-disable @typescript-eslint/naming-convention */
    wasm.setExtraEnvImports({
      bb_external_msm_bn254: () => {
        throw new Error(
          'bb_external_msm_bn254 invoked without a WebGPU bridge installed. ' +
            'Call setupWebGpuMsmBridge() and override this import via wasm.setExtraEnvImports().',
        );
      },
      bb_publish_srs_bn254: () => {
        // No-op by default. The bridge overrides this when present.
      },
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    expose(wasm);
    postMessage(Ready);
  } catch (e: unknown) {
    // Surface bootstrap failures (import/link/instantiation) that
    // would otherwise reach the parent as an opaque `error` event.
    try {
      self.postMessage({
        type: 'worker-error',
        message: e instanceof Error ? e.message : String(e),
        filename: '(main.worker.ts bootstrap)',
        lineno: 0,
        colno: 0,
        errorString: String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
    } catch {
      // ignore
    }
  }
})();
