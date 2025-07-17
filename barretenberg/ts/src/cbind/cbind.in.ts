
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

import { SharedTypesCompiler } from './shared_types_compiler.js';
import { SyncApiCompiler } from './sync_api_compiler.js';
import { AsyncApiCompiler } from './async_api_compiler.js';
import { NativeApiCompiler } from './native_api_compiler.js';

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

  // Execute bb msgpack schema command (note the new subcommand structure)
  const { stdout } = await execAsync(`${bbBuildPath} msgpack schema`);

  // Parse the JSON schema
  const schema = JSON.parse(stdout.trim());

  // First, generate shared types
  const sharedTypesCompiler = new SharedTypesCompiler();
  if (schema.commands && schema.responses) {
    sharedTypesCompiler.processApiSchema(schema.commands, schema.responses);
  }

  // Write the shared types file
  const sharedTypesPath = join(__dirname, 'api_types.gen.ts');
  writeFileSync(sharedTypesPath, sharedTypesCompiler.compile());

  // Process the schema with SyncApiCompiler
  const syncCompiler = new SyncApiCompiler();
  if (schema.commands && schema.responses) {
    syncCompiler.processApiSchema(schema.commands, schema.responses);
  }

  // Process the schema with AsyncApiCompiler
  const asyncCompiler = new AsyncApiCompiler();
  if (schema.commands && schema.responses) {
    asyncCompiler.processApiSchema(schema.commands, schema.responses);
  }

  // Process the schema with NativeApiCompiler
  const nativeCompiler = new NativeApiCompiler();
  if (schema.commands && schema.responses) {
    nativeCompiler.processApiSchema(schema.commands, schema.responses);
  }

  // Write the generated TypeScript code - sync version
  const syncOutputPath = join(__dirname, 'cbind.sync.gen.ts');
  writeFileSync(syncOutputPath, syncCompiler.compile());

  // Write the generated TypeScript code - async version
  const asyncOutputPath = join(__dirname, 'cbind.async.gen.ts');
  writeFileSync(asyncOutputPath, asyncCompiler.compile());

  // Write the generated TypeScript code - native version
  const nativeOutputPath = join(__dirname, 'native.gen.ts');
  writeFileSync(nativeOutputPath, nativeCompiler.compile());

  console.log(`Generated TypeScript bindings:`);
  console.log(`  - Shared types: ${sharedTypesPath}`);
  console.log(`  - Sync: ${syncOutputPath}`);
  console.log(`  - Async: ${asyncOutputPath}`);
  console.log(`  - Native: ${nativeOutputPath}`);
}

// eslint-disable-next-line no-console
main().catch(console.error);
