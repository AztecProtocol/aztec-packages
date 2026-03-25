/**
 * Code generation for aztec-avm bindings.
 * Thin wrapper around the shared service codegen infrastructure.
 * Run: npx tsx src/aztec-avm/generate.ts
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateForService, SERVICES } from '../cbind/service_codegen.js';

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));
const cbindDir = dirname(__dirname) + '/cbind';

generateForService(SERVICES.avm, cbindDir).catch(error => {
  console.error('Generation failed:', error);
  process.exit(1);
});
