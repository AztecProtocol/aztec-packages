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
import { SchemaVisitor } from './schema_visitor.js';
import { RustCodegen } from './rust_codegen.js';
import { ZigCodegen } from './zig_codegen.js';

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
];

// Visitor-based generators (clean architecture)
interface VisitorGeneratorConfig {
  name: string;
  enabled: boolean;
  generate: (visitor: SchemaVisitor) => { files: Array<{ path: string; content: string }> };
}

const VISITOR_GENERATORS: VisitorGeneratorConfig[] = [
  {
    name: 'Rust',
    enabled: true,
    generate: (visitor) => {
      const compiled = visitor.visit(schema.commands, schema.responses);
      const rustGen = new RustCodegen();
      const types = rustGen.generateTypes(compiled);
      const api = rustGen.generateApi(compiled);

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
    enabled: true, // Enable Zig bindings for multi-language proof of concept
    generate: (visitor) => {
      const compiled = visitor.visit(schema.commands, schema.responses);
      const zigGen = new ZigCodegen();
      const types = zigGen.generateTypes(compiled);
      const api = zigGen.generateApi(compiled);

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

let schema: any; // Global for visitor generators

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

  console.log('\nGenerating language bindings...\n');

  // Generate using visitor-based architecture
  const visitor = new SchemaVisitor();

  for (const config of VISITOR_GENERATORS) {
    if (!config.enabled) {
      console.log(`⊘ ${config.name}: disabled`);
      continue;
    }

    const { files } = config.generate(visitor);

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
