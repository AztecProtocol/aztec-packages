import type { HostImportsFactory } from "@aztec-foundation/ipc-runtime/wasm";

/**
 * bb's wasm platform layer imports three functions of its own beyond WASI: a logger, an abort hook
 * and the thread count (barretenberg/cpp/src/barretenberg/env, WASM_IMPORT). Copied into the
 * generated bb.js-api package as src/wasm_host_imports.ts.
 */
export const hostImports: HostImportsFactory = (ctx) => ({
  env: {
    logstr: (ptr: number) => {
      const mib = (ctx.memory().buffer.byteLength / (1024 * 1024)).toFixed(2);
      ctx.logger(`${ctx.readCString(ptr)} (mem: ${mib}MiB)`);
    },
    throw_or_abort_impl: (ptr: number) => {
      throw new Error(ctx.readCString(ptr));
    },
    env_hardware_concurrency: () => ctx.threads,
  },
});
