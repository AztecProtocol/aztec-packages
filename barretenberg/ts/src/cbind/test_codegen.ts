/**
 * Test the new visitor-based codegen
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import { SchemaVisitor } from './schema_visitor.js';
import { RustCodegen } from './rust_codegen.js';
import { TypeScriptCodegen } from './ts_codegen.js';

const execAsync = promisify(exec);
// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

async function test() {
  console.log('Testing new visitor-based codegen...\n');

  // Get schema from bb
  const bbBuildPath = process.env.BB_BINARY_PATH || join(__dirname, '../../../cpp/build/bin/bb');
  console.log('Fetching schema from bb...');
  const { stdout } = await execAsync(`${bbBuildPath} msgpack schema`);
  const schema = JSON.parse(stdout.trim());

  // Visit schema
  console.log('Visiting schema...');
  const visitor = new SchemaVisitor();
  const compiled = visitor.visit(schema.commands, schema.responses);

  console.log(`Found ${compiled.structs.size} command structs`);
  console.log(`Found ${compiled.responses.size} response structs`);
  console.log(`Found ${compiled.commands.length} commands\n`);

  // Generate Rust code
  console.log('Generating Rust code...');
  const rustGen = new RustCodegen();
  const rustTypes = rustGen.generateTypes(compiled);
  const rustApi = rustGen.generateApi(compiled);

  // Write Rust output
  const rustTypesPath = join(__dirname, '../../../rust/barretenberg-rs/src/generated_types.rs');
  const rustApiPath = join(__dirname, '../../../rust/barretenberg-rs/src/api.rs');

  mkdirSync(dirname(rustTypesPath), { recursive: true });
  writeFileSync(rustTypesPath, rustTypes);
  writeFileSync(rustApiPath, rustApi);

  console.log(`✓ Written: ${rustTypesPath}`);
  console.log(`✓ Written: ${rustApiPath}`);

  // Generate TypeScript code
  console.log('\nGenerating TypeScript code...');
  const tsGen = new TypeScriptCodegen();
  const tsTypes = tsGen.generateTypes(compiled);
  const tsSyncApi = tsGen.generateApi(compiled, 'sync');
  const tsAsyncApi = tsGen.generateApi(compiled, 'async');

  // Write TypeScript output
  const tsTypesPath = join(__dirname, '../bb_generated/api_types.ts');
  const tsSyncApiPath = join(__dirname, '../bb_generated/sync_api.ts');
  const tsAsyncApiPath = join(__dirname, '../bb_generated/async_api.ts');

  mkdirSync(dirname(tsTypesPath), { recursive: true });
  writeFileSync(tsTypesPath, tsTypes);
  writeFileSync(tsSyncApiPath, tsSyncApi);
  writeFileSync(tsAsyncApiPath, tsAsyncApi);

  console.log(`✓ Written: ${tsTypesPath}`);
  console.log(`✓ Written: ${tsSyncApiPath}`);
  console.log(`✓ Written: ${tsAsyncApiPath}`);

  console.log('\n✨ Codegen test complete!');
  console.log('\nNow run: cd ../../rust/tests && cargo test --release');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
