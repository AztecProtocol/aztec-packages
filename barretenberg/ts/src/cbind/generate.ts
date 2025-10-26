/**
 * Multi-language code generation from BB msgpack schema
 *
 * Architecture:
 *   Raw Schema → IR Processor → Language Generators → Clean Code
 *
 * This elegant architecture allows adding new languages trivially
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
import { SchemaProcessor } from './schema_ir.js';
import { RustGenerator } from './generators/rust_generator.js';
import { ZigGenerator } from './generators/zig_generator.js';

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

// IR-based generators (new elegant architecture)
interface IrGeneratorConfig {
  name: string;
  enabled: boolean;
  generate: (processor: SchemaProcessor) => { files: Array<{ path: string; content: string }> };
}

const IR_GENERATORS: IrGeneratorConfig[] = [
  {
    name: 'Rust (IR-based)',
    enabled: true,
    generate: (processor) => {
      const ir = processor.process(schema.commands, schema.responses);
      const rustGen = new RustGenerator();
      const { types, api } = rustGen.generate(ir);

      return {
        files: [
          { path: '../../../rust/barretenberg-rs/src/generated_types.rs', content: types },
          { path: '../../../rust/barretenberg-rs/src/api.rs', content: api },
        ],
      };
    },
  },
  {
    name: 'Zig (proof of concept)',
    enabled: false, // Enable to generate Zig bindings
    generate: (processor) => {
      const ir = processor.process(schema.commands, schema.responses);
      const zigGen = new ZigGenerator();
      const { types, api } = zigGen.generate(ir);

      return {
        files: [
          { path: '../../../zig/src/generated_types.zig', content: types },
          { path: '../../../zig/src/api.zig', content: api },
        ],
      };
    },
  },
];

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

let schema: any; // Global for IR generators

async function generate() {
  const bbBuildPath = process.env.BB_BINARY_PATH || join(__dirname, '../../../cpp/build/bin/bb');

  // Get schema from bb
  console.log('Fetching msgpack schema from bb...');
  const { stdout } = await execAsync(`${bbBuildPath} msgpack schema`);
  schema = JSON.parse(stdout.trim());

  if (!schema.commands || !schema.responses) {
    throw new Error('Invalid schema: missing commands or responses');
  }

  console.log('Generating TypeScript bindings...\n');

  // Ensure output directory exists
  const outputDir = join(__dirname, 'generated');
  mkdirSync(outputDir, { recursive: true });

  // Generate TypeScript files (legacy compilers)
  for (const config of GENERATORS) {
    const compiler = config.createCompiler();
    compiler.processApiSchema(schema.commands, schema.responses);

    const outputPath = join(__dirname, config.outputFile);
    const content = compiler.compile();
    writeFileSync(outputPath, content);

    console.log(`✓ ${config.name}: ${outputPath}`);
  }

  console.log('\nGenerating language bindings (IR-based)...\n');

  // Generate using new IR-based architecture
  const processor = new SchemaProcessor();

  for (const config of IR_GENERATORS) {
    if (!config.enabled) {
      console.log(`⊘ ${config.name}: disabled`);
      continue;
    }

    const { files } = config.generate(processor);

    for (const file of files) {
      const outputPath = join(__dirname, file.path);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, file.content);
      console.log(`✓ ${config.name}: ${outputPath}`);
    }
  }

  console.log('\n✨ Generation complete! Clean, maintainable, multi-language architecture.');
}

// Run the generator
generate().catch(error => {
  console.error('Generation failed:', error);
  process.exit(1);
});
