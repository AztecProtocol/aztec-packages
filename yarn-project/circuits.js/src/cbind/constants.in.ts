import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { callCbind } from './cbind.js';
import { CircuitsWasm } from '../wasm/circuits_wasm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CPP_FILE_PATH = join(__dirname, '../../../../circuits/cpp/src/aztec3/constants.hpp');
const TS_FILE_PATH = join(__dirname, '/constants.gen.ts');

/**
 * Convert the C++ constants to TypeScript.
 */
async function convertToTypeScript(): Promise<void> {
  const wasm = await CircuitsWasm.get();
  const result = callCbind(wasm, 'get_circuit_constants', []);

  const code: string[] = [];

  Object.entries(result).forEach(([key, value]) => {
    code.push(`export const ${key} = ${value};`);
  });

  let accumulatedCode: string = code.join('\n');

  accumulatedCode =
    '/* eslint-disable */\n// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants\n' + accumulatedCode;

  const cppContent: string = fs.readFileSync(CPP_FILE_PATH, 'utf-8');
  accumulatedCode =
    accumulatedCode +
    '\n' +
    cppContent
      .split('TS-RELEVANT-CODE-START')[1]
      .split('// TS-RELEVANT-CODE-END')[0]
      .replace(/enum (\w+)/g, 'export enum $1');

  fs.writeFileSync(TS_FILE_PATH, accumulatedCode);
}

// eslint-disable-next-line no-console
convertToTypeScript().catch(console.error);
