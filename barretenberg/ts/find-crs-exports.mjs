import { BarretenbergWasmMain } from './src/barretenberg_wasm/barretenberg_wasm_main/index.js';
import { fetchModuleAndThreads } from './src/barretenberg_wasm/index.js';

async function main() {
  const { module } = await fetchModuleAndThreads(1);
  const wasm = new BarretenbergWasmMain();
  await wasm.init(module, 1);
  const exports = wasm.exports();
  const crsExports = Object.keys(exports).filter(k => k.includes('crs') || k.includes('srs')).sort();
  console.log('CRS-related exports:', crsExports);
}

main();