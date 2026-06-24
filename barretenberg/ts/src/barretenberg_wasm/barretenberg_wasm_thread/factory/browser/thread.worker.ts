// See sibling main.worker.ts for why this file uses dynamic imports
// inside an async IIFE rather than top-level static imports: static
// imports are evaluated before any top-level code, so an error
// listener written above them never registers if an import fails.

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
    // ignore
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
    const { BarretenbergWasmThread } = await import('../../index.js');
    const { Ready } = await import('../../../helpers/browser/index.js');

    const thread = new BarretenbergWasmThread();

    // Mirror the main worker's default stubs: every pthread worker
    // instantiates its own WASM module against the same env, so the
    // BBERG_WEBGPU_MSM_HOOK imports have to be defined here too or
    // instantiation fails with `function import requires a callable`.
    // The native pippenger path never invokes them; callers that wire
    // the WebGPU bridge can override via setExtraEnvImports.
    /* eslint-disable @typescript-eslint/naming-convention */
    thread.setExtraEnvImports({
      bb_external_msm_bn254: () => {
        throw new Error(
          'bb_external_msm_bn254 invoked in a pthread worker without WebGPU bridge wiring',
        );
      },
      bb_publish_srs_bn254: () => {
        // No-op by default. The bridge overrides this when present.
      },
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    expose(thread);
    postMessage(Ready);
  } catch (e: unknown) {
    try {
      self.postMessage({
        type: 'worker-error',
        message: e instanceof Error ? e.message : String(e),
        filename: '(thread.worker.ts bootstrap)',
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
