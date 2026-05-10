/**
 * Compatibility shim. Under the Emscripten-based loader the dedicated
 * `BarretenbergWasmBase` (which used to back both the "main" and "thread"
 * implementations of a hand-rolled worker harness) collapses into the single
 * `BarretenbergWasmMain` class -- Emscripten owns thread spawning. We keep
 * the export name so external imports continue to type-check.
 *
 * TODO(2026-05-26): drop this alias after the compatibility window expires
 * (matches the deletion date on the legacy-toolchain-compat CI job). At
 * removal time, sweep `BarretenbergWasmBase` imports and rewrite them to
 * `BarretenbergWasmMain` from `../barretenberg_wasm_main/index.js`.
 */
export { BarretenbergWasmMain as BarretenbergWasmBase } from '../barretenberg_wasm_main/index.js';
