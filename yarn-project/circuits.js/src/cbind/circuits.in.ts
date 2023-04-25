import { CBindCompiler } from './cbind_compiler.js';
import { getCbindSchema } from './cbind.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { CircuitsWasm } from '../wasm/circuits_wasm.js';

export async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const wasm = await CircuitsWasm.get();
  const compiler = new CBindCompiler();
  for (const [key, value] of Object.entries(wasm.exports())) {
    if (typeof value === 'function' && key.endsWith('__schema')) {
      const cname = key.substring(0, key.length - '__schema'.length);
      compiler.processCbind(cname, getCbindSchema(wasm, cname));
    }
  }
  writeFileSync(__dirname + '/circuits.gen.ts', compiler.compile());
}

main().catch(console.error);
