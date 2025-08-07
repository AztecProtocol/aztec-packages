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
  createNativeApiCompiler,
  type SchemaCompiler,
} from './schema_compiler.js';

const execAsync = promisify(exec);

interface GeneratorConfig {
  name: string;
  outputFile: string;
  createCompiler: () => SchemaCompiler;
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
  {
    name: 'Native API',
    outputFile: 'generated/native.ts',
    createCompiler: createNativeApiCompiler,
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

  // Generate each output file
  for (const config of GENERATORS) {
    const compiler = config.createCompiler();
    compiler.processApiSchema(schema.commands, schema.responses);

    const outputPath = join(__dirname, config.outputFile);
    const content = compiler.compile();
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
