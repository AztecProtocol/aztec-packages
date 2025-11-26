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
import { unpack } from 'msgpackr';
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

  // Generate curve constants
  console.log('\nGenerating curve constants...');
  await generateCurveConstants(bbBuildPath, outputDir);

  console.log('\n✨ Generation complete! Clean, maintainable, multi-language architecture.');
}

async function generateCurveConstants(bbBuildPath: string, outputDir: string) {
  // Get curve constants from bb as msgpack binary
  const { stdout: constantsBuffer } = await execAsync(`${bbBuildPath} msgpack curve_constants`, {
    encoding: 'buffer',
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });

  // Decode msgpack
  const constants = unpack(constantsBuffer as Buffer);

  // Helper to convert Uint8Array to hex string
  const toHex = (bytes: Uint8Array) => '0x' + Buffer.from(bytes).toString('hex');

  // Helper to convert Uint8Array to bigint (big-endian)
  const toBigInt = (bytes: Uint8Array) => {
    let result = 0n;
    for (const byte of bytes) {
      result = (result << 8n) | BigInt(byte);
    }
    return result;
  };

  // Helper to serialize point coordinate (handles both Uint8Array and array of Uint8Array for field2)
  const serializeCoordinate = (coord: Uint8Array | Uint8Array[]) => {
    if (Array.isArray(coord)) {
      // For field2 (like BN254 G2), we have array of two Uint8Arrays
      return `[${coord.map(c => `new Uint8Array([${Array.from(c).join(', ')}])`).join(', ')}]`;
    } else {
      // For regular fields, single Uint8Array
      return `new Uint8Array([${Array.from(coord).join(', ')}])`;
    }
  };

  // Generate TypeScript file
  const content = `/**
 * Curve constants generated from barretenberg native binary.
 * DO NOT EDIT - This file is auto-generated by generate.ts
 */

/**
 * BN254 curve constants
 */
export const BN254_FR_MODULUS = ${toBigInt(constants.bn254_fr_modulus)}n;
export const BN254_FQ_MODULUS = ${toBigInt(constants.bn254_fq_modulus)}n;

export const BN254_G1_GENERATOR = {
  x: ${serializeCoordinate(constants.bn254_g1_generator.x)},
  y: ${serializeCoordinate(constants.bn254_g1_generator.y)},
} as const;

export const BN254_G2_GENERATOR = {
  x: ${serializeCoordinate(constants.bn254_g2_generator.x)},
  y: ${serializeCoordinate(constants.bn254_g2_generator.y)},
} as const;

/**
 * Grumpkin curve constants
 */
export const GRUMPKIN_FR_MODULUS = ${toBigInt(constants.grumpkin_fr_modulus)}n;
export const GRUMPKIN_FQ_MODULUS = ${toBigInt(constants.grumpkin_fq_modulus)}n;

export const GRUMPKIN_G1_GENERATOR = {
  x: ${serializeCoordinate(constants.grumpkin_g1_generator.x)},
  y: ${serializeCoordinate(constants.grumpkin_g1_generator.y)},
} as const;

/**
 * Secp256k1 curve constants
 */
export const SECP256K1_FR_MODULUS = ${toBigInt(constants.secp256k1_fr_modulus)}n;
export const SECP256K1_FQ_MODULUS = ${toBigInt(constants.secp256k1_fq_modulus)}n;

export const SECP256K1_G1_GENERATOR = {
  x: ${serializeCoordinate(constants.secp256k1_g1_generator.x)},
  y: ${serializeCoordinate(constants.secp256k1_g1_generator.y)},
} as const;

/**
 * Secp256r1 curve constants
 */
export const SECP256R1_FR_MODULUS = ${toBigInt(constants.secp256r1_fr_modulus)}n;
export const SECP256R1_FQ_MODULUS = ${toBigInt(constants.secp256r1_fq_modulus)}n;

export const SECP256R1_G1_GENERATOR = {
  x: ${serializeCoordinate(constants.secp256r1_g1_generator.x)},
  y: ${serializeCoordinate(constants.secp256r1_g1_generator.y)},
} as const;
`;

  const outputPath = join(outputDir, 'curve_constants.ts');
  writeFileSync(outputPath, content);
  console.log(`✓ Curve constants: ${outputPath}`);
}

// Run the generator
generate().catch(error => {
  console.error('Generation failed:', error);
  process.exit(1);
});
