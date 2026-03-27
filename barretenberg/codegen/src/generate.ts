/**
 * IPC code generation CLI.
 *
 * Two modes:
 *
 * 1. Service mode (generate all targets for named services):
 *    generate.ts [service...]         # e.g. generate.ts bb wsdb cdb avm
 *
 * 2. Single-schema mode (generate one language from any schema file):
 *    generate.ts --schema <file> --lang <ts|rust|zig|cpp> --out <dir>
 *    Prefix is auto-detected from command names (e.g. WsdbGetTreeInfo → Wsdb).
 *
 * Zero npm dependencies — runs with Node.js 22+ via --experimental-strip-types.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { SchemaVisitor } from './schema_visitor.ts';
import { TypeScriptCodegen } from './typescript_codegen.ts';
import { RustCodegen } from './rust_codegen.ts';
import { ZigCodegen } from './zig_codegen.ts';
import { CppCodegen } from './cpp_codegen.ts';
import { generateForService, computeSchemaHash, SERVICES } from './service_codegen.ts';

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface SingleArgs { mode: 'single'; schema: string; lang: string; out: string; prefix: string; server: boolean; client: boolean }
interface ServiceArgs { mode: 'service'; services: string[] }

function parseArgs(argv: string[]): SingleArgs | ServiceArgs {
  if (argv.some(a => a.startsWith('--'))) {
    let schema = '', lang = '', out = '', prefix = '';
    let server = false, client = false;
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--schema') schema = argv[++i];
      else if (argv[i] === '--lang') lang = argv[++i];
      else if (argv[i] === '--out') out = argv[++i];
      else if (argv[i] === '--prefix') prefix = argv[++i];
      else if (argv[i] === '--server') server = true;
      else if (argv[i] === '--client') client = true;
    }
    if (!schema || !lang || !out) {
      console.error('Usage: generate.ts --schema <file> --lang <ts|rust|zig|cpp> --out <dir> [--server] [--client]');
      process.exit(1);
    }
    return { mode: 'single', schema, lang, out, prefix, server, client };
  }
  return { mode: 'service', services: argv.length > 0 ? argv : Object.keys(SERVICES) };
}

// ---------------------------------------------------------------------------
// Single-schema generation
// ---------------------------------------------------------------------------

/** Detect common prefix from command names (e.g. WsdbGetTreeInfo, WsdbCreateFork → Wsdb) */
function detectPrefix(compiled: import('./schema_visitor.ts').CompiledSchema): string {
  const names = compiled.commands.map(c => c.name);
  if (names.length === 0) return '';
  let prefix = names[0];
  for (const name of names.slice(1)) {
    while (prefix && !name.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  // Trim to a word boundary (don't split mid-word)
  const match = prefix.match(/^[A-Z][a-z]*/);
  if (match && match[0].length < prefix.length) {
    // Check if all names start with at least one PascalCase word
    const words = prefix.match(/[A-Z][a-z]*/g) || [];
    // Use as many complete words as form a common prefix
    let result = '';
    for (const word of words) {
      const candidate = result + word;
      if (names.every(n => n.startsWith(candidate))) {
        result = candidate;
      } else {
        break;
      }
    }
    return result;
  }
  return prefix;
}

/** Copy a template file from codegen/templates/ to the output dir */
function copyTemplate(lang: string, filename: string, outDir: string) {
  const templatePath = join(__dirname, '..', 'templates', lang, filename);
  const destPath = join(outDir, filename);
  writeFileSync(destPath, readFileSync(templatePath, 'utf-8'));
  console.log(`  ${destPath} (template)`);
}

function generateSingle(args: SingleArgs) {
  const absSchema = resolve(args.schema);
  const absOut = resolve(args.out);
  mkdirSync(absOut, { recursive: true });

  const rawJson = readFileSync(absSchema, 'utf-8').trim();
  const schema = JSON.parse(rawJson);
  const visitor = new SchemaVisitor();
  const compiled = visitor.visit(schema.commands, schema.responses);
  const schemaHash = computeSchemaHash(rawJson);

  const prefix = args.prefix || detectPrefix(compiled);
  console.log(`Schema: ${absSchema} (${compiled.commands.length} commands, ${compiled.structs.size} structs, prefix=${prefix})`);

  function writeFile(name: string, content: string) {
    const path = join(absOut, name);
    writeFileSync(path, content);
    console.log(`  ${path}`);
  }

  switch (args.lang) {
    case 'ts': {
      const gen = new TypeScriptCodegen();
      writeFile('api_types.ts', gen.generateTypes(compiled, schemaHash));
      if (args.server) {
        writeFile('server.ts', gen.generateServerApi(compiled));
        copyTemplate('ts', 'ipc_server.ts', absOut);
      }
      if (args.client) {
        writeFile('async.ts', gen.generateAsyncApi(compiled));
        copyTemplate('ts', 'ipc_client.ts', absOut);
      }
      break;
    }
    case 'rust': {
      const gen = new RustCodegen({ prefix });
      writeFile('generated_types.rs', gen.generateTypes(compiled, schemaHash));
      if (args.server) {
        writeFile('server.rs', gen.generateServer(compiled));
        copyTemplate('rust', 'ipc_server.rs', absOut);
      }
      if (args.client) {
        writeFile('api.rs', gen.generateApi(compiled));
        copyTemplate('rust', 'ipc_client.rs', absOut);
      }
      break;
    }
    case 'zig': {
      const gen = new ZigCodegen({ prefix, clientName: `${prefix}Client` });
      writeFile('types.zig', gen.generateTypes(compiled, schemaHash));
      if (args.server) {
        writeFile('server.zig', gen.generateServer(compiled));
        copyTemplate('zig', 'ipc_server.zig', absOut);
      }
      if (args.client) {
        writeFile('client.zig', gen.generateClient(compiled));
        copyTemplate('zig', 'ipc_client.zig', absOut);
      }
      break;
    }
    case 'cpp': {
      const gen = new CppCodegen({
        namespace: prefix.toLowerCase(),
        prefix,
        executeHeader: '',
        commandsHeader: '',
      });
      writeFile('types.hpp', gen.generateStandaloneTypes(compiled));
      if (args.server) copyTemplate('cpp', 'ipc_server.hpp', absOut);
      if (args.client) copyTemplate('cpp', 'ipc_client.hpp', absOut);
      break;
    }
    default:
      console.error(`Unknown language: ${args.lang}. Available: ts, rust, zig, cpp`);
      process.exit(1);
  }

  console.log('Done.');
}

// ---------------------------------------------------------------------------
// Service mode generation (existing behavior)
// ---------------------------------------------------------------------------

/** Convert hex string to BigInt */
function hexToBigInt(hex: string): bigint {
  return BigInt('0x' + hex);
}

function hexToByteList(hex: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return `new Uint8Array([${bytes.join(', ')}])`;
}

function serializeCoordinate(coord: string | string[]): string {
  if (Array.isArray(coord)) {
    return `[${coord.map(c => hexToByteList(c)).join(', ')}]`;
  }
  return hexToByteList(coord);
}

function generateCurveConstants(outputDir: string) {
  const constantsPath = join(__dirname, '../schemas/bb_curve_constants.json');
  const constants = JSON.parse(readFileSync(constantsPath, 'utf-8'));

  const content = `/**
 * Curve constants generated from barretenberg.
 * DO NOT EDIT - This file is auto-generated by barretenberg/codegen
 */

export const BN254_FR_MODULUS = ${hexToBigInt(constants.bn254_fr_modulus)}n;
export const BN254_FQ_MODULUS = ${hexToBigInt(constants.bn254_fq_modulus)}n;

export const BN254_G1_GENERATOR = {
  x: ${serializeCoordinate(constants.bn254_g1_generator.x)},
  y: ${serializeCoordinate(constants.bn254_g1_generator.y)},
} as const;

export const BN254_G2_GENERATOR = {
  x: ${serializeCoordinate(constants.bn254_g2_generator.x)},
  y: ${serializeCoordinate(constants.bn254_g2_generator.y)},
} as const;

export const GRUMPKIN_FR_MODULUS = ${hexToBigInt(constants.grumpkin_fr_modulus)}n;
export const GRUMPKIN_FQ_MODULUS = ${hexToBigInt(constants.grumpkin_fq_modulus)}n;

export const GRUMPKIN_G1_GENERATOR = {
  x: ${serializeCoordinate(constants.grumpkin_g1_generator.x)},
  y: ${serializeCoordinate(constants.grumpkin_g1_generator.y)},
} as const;

export const SECP256K1_FR_MODULUS = ${hexToBigInt(constants.secp256k1_fr_modulus)}n;
export const SECP256K1_FQ_MODULUS = ${hexToBigInt(constants.secp256k1_fq_modulus)}n;

export const SECP256K1_G1_GENERATOR = {
  x: ${serializeCoordinate(constants.secp256k1_g1_generator.x)},
  y: ${serializeCoordinate(constants.secp256k1_g1_generator.y)},
} as const;

export const SECP256R1_FR_MODULUS = ${hexToBigInt(constants.secp256r1_fr_modulus)}n;
export const SECP256R1_FQ_MODULUS = ${hexToBigInt(constants.secp256r1_fq_modulus)}n;

export const SECP256R1_G1_GENERATOR = {
  x: ${serializeCoordinate(constants.secp256r1_g1_generator.x)},
  y: ${serializeCoordinate(constants.secp256r1_g1_generator.y)},
} as const;
`;

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'curve_constants.ts'), content);
  console.log(`  [curve_constants] ${join(outputDir, 'curve_constants.ts')}`);
}

function generateServices(services: string[]) {
  for (const name of services) {
    if (!SERVICES[name]) {
      console.error(`Unknown service: ${name}. Available: ${Object.keys(SERVICES).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`Generating bindings for: ${services.join(', ')}\n`);

  for (const name of services) {
    console.log(`--- ${name} ---`);
    generateForService(SERVICES[name], __dirname);
    console.log('');
  }

  if (services.includes('bb')) {
    console.log('--- curve constants ---');
    generateCurveConstants(join(__dirname, '../../ts/src/cbind/generated'));
    console.log('');
  }

  console.log('Generation complete.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const parsed = parseArgs(process.argv.slice(2));
if (parsed.mode === 'single') {
  generateSingle(parsed);
} else {
  generateServices(parsed.services);
}
