import { Proxify } from '../transport/index.js';
import { WasmModule } from '../wasm/wasm_module.js';

export type WasmWorker = Proxify<WasmModule> & { destroyWorker(): void };
