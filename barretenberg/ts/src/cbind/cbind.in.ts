
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

import { getCbindSchema } from './cbind.js';
import { CbindCompiler } from './compiler.js';

const execAsync = promisify(exec);

/**
 * Generate TypeScript bindings for functions in CircuitsWasm.
 * This processes the schema for each export and compiles the TypeScript functions
 * to a 'circuits.gen.ts'.
 *
 * @returns -
 */
export async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Run barretenberg from the cpp build directory.
  // We want to call 'bb msgpack_schema' and parse this schema using the CbindCompiler.
  const bbBuildPath = join(__dirname, '..', '..', '..', 'cpp', 'build', 'bin', 'bb');

  // Execute bb msgpack_schema command
  const { stdout } = await execAsync(`${bbBuildPath} msgpack_schema`);

  // Parse the JSON schema
  const schema = JSON.parse(stdout.trim());

  // Process the schema with CbindCompiler - sync version
  const syncCompiler = new CbindCompiler('sync');
  if (schema.commands && schema.responses) {
    syncCompiler.processApiSchema(schema.commands, schema.responses);
  }

  // Process the schema with CbindCompiler - async version
  const asyncCompiler = new CbindCompiler('async');
  if (schema.commands && schema.responses) {
    asyncCompiler.processApiSchema(schema.commands, schema.responses);
  }

  // Write the generated TypeScript code - sync version
  const syncOutputPath = join(__dirname, 'cbind.sync.gen.ts');
  writeFileSync(syncOutputPath, syncCompiler.compile());

  // Write the generated TypeScript code - async version
  const asyncOutputPath = join(__dirname, 'cbind.async.gen.ts');
  writeFileSync(asyncOutputPath, asyncCompiler.compile());

  // Also create an index file that exports both
  const indexContent = `/* eslint-disable */
// GENERATED FILE DO NOT EDIT, RUN yarn generate
export * from './cbind.sync.gen.js';
export * as async from './cbind.async.gen.js';
`;
  const indexPath = join(__dirname, 'cbind.gen.ts');
  writeFileSync(indexPath, indexContent);

  console.log(`Generated TypeScript bindings:
  - Sync: ${syncOutputPath}
  - Async: ${asyncOutputPath}
  - Index: ${indexPath}`);
}

// eslint-disable-next-line no-console
main().catch(console.error);
