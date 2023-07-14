import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { callCbind } from './cbind.js';
import { CircuitsWasm } from '../wasm/circuits_wasm.js';

/**
 * Convert the C++ constants to TypeScript and Noir.
 */
async function main(): Promise<void> {
  const wasm = await CircuitsWasm.get();
  const constants = callCbind(wasm, 'get_circuit_constants', []);
  const generatorIndexEnum = callCbind(wasm, 'get_circuit_generator_index', []);
  const privateStateNoteGeneratorIndexEnum = callCbind(wasm, 'get_circuit_private_state_note_generator_index', []);
  const privateStateTypeEnum = callCbind(wasm, 'get_circuit_private_state_type', []);

  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Typescript
  const resultTS: string =
    '/* eslint-disable */\n// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants\n' +
    processConstantsTS(constants) +
    processEnumTS('GeneratorIndex', generatorIndexEnum) +
    processEnumTS('PrivateStateNoteGeneratorIndex', privateStateNoteGeneratorIndexEnum) +
    processEnumTS('PrivateStateType', privateStateTypeEnum);

  fs.writeFileSync(__dirname + '/constants.gen.ts', resultTS);

  // Noir
  const resultNoir: string =
    '// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in circuits.js\n' +
    processConstantsNoir(constants) +
    processConstantsNoir(generatorIndexEnum) + // Note: Noir doesn't support enums so we export them as constants
    processConstantsNoir(privateStateNoteGeneratorIndexEnum) +
    processConstantsNoir(privateStateTypeEnum);

  const noirTargetPath = join(__dirname, '../../../noir-contracts/src/libs/noir-aztec/src/constants.gen.nr');
  fs.writeFileSync(noirTargetPath, resultNoir);
}

/**
 * Processes a collection of constants and generates code to export them as TypeScript constants.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @returns A string containing code that exports the constants as TypeScript constants.
 */
function processConstantsTS(constants: { [key: string]: number }): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    code.push(`export const ${key} = ${value};`);
  });
  return code.join('\n');
}

/**
 * Processes an enum and generates code to export it as a TypeScript enum.
 *
 * @param enumName - The name of the enum.
 * @param enumValues - An object containing key-value pairs representing enum values.
 * @returns A string containing code that exports the enum as a TypeScript enum.
 */
function processEnumTS(enumName: string, enumValues: { [key: string]: number }): string {
  const code: string[] = [];

  code.push(`export enum ${enumName} {`);

  Object.entries(enumValues).forEach(([key, value]) => {
    code.push(`  ${key} = ${value},`);
  });

  code.push('}');

  return code.join('\n');
}

/**
 * Processes a collection of constants and generates code to export them as Noir constants.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @returns A string containing code that exports the constants as Noir constants.
 */
function processConstantsNoir(constants: { [key: string]: number }): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    code.push(`global ${key}: comptime Field = ${value};`);
  });
  return code.join('\n') + '\n';
}

// eslint-disable-next-line no-console
main().catch(console.error);
