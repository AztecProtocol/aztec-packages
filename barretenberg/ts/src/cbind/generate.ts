/**
 * Generate TypeScript bindings from msgpack schema
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import {
  createSharedTypesCompiler,
  createSyncApiCompiler,
  createAsyncApiCompiler,
  type SchemaCompiler,
} from './schema_compiler.js';
import { createRustCompilerV2 } from './rust_schema_compiler_v2.js';

const execAsync = promisify(exec);

interface GeneratorConfig {
  name: string;
  outputFile: string;
  createCompiler: () => SchemaCompiler;
}

interface RustGeneratorConfig {
  name: string;
  outputFile: string;
  createCompiler: () => any; // v2 compiler has same interface
}

const GENERATORS: GeneratorConfig[] = [
  {
    name: 'Shared types',
    outputFile: 'generated/api_types.ts',
    createCompiler: createSharedTypesCompiler,
  },
  {
    name: 'Sync API',
    outputFile: 'generated/sync.ts',
    createCompiler: createSyncApiCompiler,
  },
  {
    name: 'Async API',
    outputFile: 'generated/async.ts',
    createCompiler: createAsyncApiCompiler,
  },
];

const RUST_GENERATORS: RustGeneratorConfig[] = [
  {
    name: 'Rust types',
    outputFile: '../../../rust/barretenberg-rs/src/generated_types.rs',
    createCompiler: createRustCompilerV2,
  },
  {
    name: 'Rust API',
    outputFile: '../../../rust/barretenberg-rs/src/api.rs',
    createCompiler: createRustCompilerV2,
  },
];

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

async function generate() {
  const bbBuildPath = process.env.BB_BINARY_PATH || join(__dirname, '../../../cpp/build/bin/bb');

  // Get schema from bb
  console.log('Fetching msgpack schema from bb...');
  const { stdout } = await execAsync(`${bbBuildPath} msgpack schema`);
  const schema = JSON.parse(stdout.trim());

  if (!schema.commands || !schema.responses) {
    throw new Error('Invalid schema: missing commands or responses');
  }

  console.log('Generating TypeScript bindings...\n');

  // Ensure output directory exists
  const outputDir = join(__dirname, 'generated');
  mkdirSync(outputDir, { recursive: true });

  // Generate TypeScript files
  for (const config of GENERATORS) {
    const compiler = config.createCompiler();
    compiler.processApiSchema(schema.commands, schema.responses);

    const outputPath = join(__dirname, config.outputFile);
    const content = compiler.compile();
    writeFileSync(outputPath, content);

    console.log(`✓ ${config.name}: ${outputPath}`);
  }

  console.log('\nGenerating Rust bindings...\n');

  // Generate Rust files
  for (const config of RUST_GENERATORS) {
    const compiler = config.createCompiler();
    compiler.processApiSchema(schema.commands, schema.responses);

    const outputPath = join(__dirname, config.outputFile);

    // Use compileApi() for api.rs, compile() for other files
    const content = outputPath.endsWith('api.rs') ? compiler.compileApi() : compiler.compile();

    // Ensure Rust output directory exists
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content);

    console.log(`✓ ${config.name}: ${outputPath}`);
  }

  console.log('\nGeneration complete!');
}

// Run the generator
generate().catch(error => {
  console.error('Generation failed:', error);
  process.exit(1);
});
