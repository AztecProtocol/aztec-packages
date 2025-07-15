
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

  // Process the schema with CbindCompiler
  const compiler = new CbindCompiler();

  // Process the command/response pairs from the schema
  if (schema.commands && schema.responses) {
    // The schema has two NamedUnion types: commands and responses
    // Each command type has a corresponding response type at the same index
    compiler.processApiSchema(schema.commands, schema.responses);
  }

  // Write the generated TypeScript code
  const outputPath = join(__dirname, 'cbind.gen.ts');
  writeFileSync(outputPath, compiler.compile());

  console.log(`Generated TypeScript bindings at ${outputPath}`);
}

// eslint-disable-next-line no-console
main().catch(console.error);
