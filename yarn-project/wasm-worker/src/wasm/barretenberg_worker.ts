import { Proxify } from '../transport/index.js';
import { WasmModule } from './wasm_module.js';

export interface BarretenbergWorker extends Proxify<WasmModule> {
  destroyWorker(): Promise<void>;
}
