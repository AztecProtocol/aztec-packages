/**
 * IPC code generation CLI.
 *
 * Usage:
 *   generate.ts --schema <file> --lang <ts|rust|zig|cpp> --out <dir> [flags]
 *
 * Required:
 *   --schema <file>    JSON schema file
 *   --lang <lang>      Target language
 *   --out <dir>        Output directory for always-regenerated code
 *
 * Optional:
 *   --prefix <str>           Type prefix (auto-detected if omitted)
 *   --server                 Generate server dispatch
 *   --client                 Generate client
 *   --skeleton <dir>         Generate handler stubs + main (one-time, not regenerated)
 *   --cpp-namespace <ns>     C++ namespace (e.g. bb::wsdb)
 *   --cpp-wire-namespace <ns> Wire types sub-namespace (default: wire)
 *   --curve-constants        Generate TS curve constants (bb-only special case)
 *
 * Zero npm dependencies — runs with Node.js 22+ via --experimental-strip-types.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { SchemaVisitor, type CompiledSchema } from './schema_visitor.ts';
import { TypeScriptCodegen } from './typescript_codegen.ts';
import { RustCodegen } from './rust_codegen.ts';
import { ZigCodegen } from './zig_codegen.ts';
import { CppCodegen } from './cpp_codegen.ts';
import { toSnakeCase } from './naming.ts';

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface Args {
  schema: string;
  lang: string;
  out: string;
  prefix: string;
  server: boolean;
  client: boolean;
  skeleton: string;
  cppNamespace: string;
  cppWireNamespace: string;
  cppIncludeDir: string;
  curveConstants: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    schema: '', lang: '', out: '', prefix: '',
    server: false, client: false, skeleton: '',
    cppNamespace: '', cppWireNamespace: 'wire', cppIncludeDir: '',
    curveConstants: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--schema': args.schema = argv[++i]; break;
      case '--lang': args.lang = argv[++i]; break;
      case '--out': args.out = argv[++i]; break;
      case '--prefix': args.prefix = argv[++i]; break;
      case '--server': args.server = true; break;
      case '--client': args.client = true; break;
      case '--skeleton': args.skeleton = argv[++i]; break;
      case '--cpp-namespace': args.cppNamespace = argv[++i]; break;
      case '--cpp-wire-namespace': args.cppWireNamespace = argv[++i]; break;
      case '--cpp-include-dir': args.cppIncludeDir = argv[++i]; break;
      case '--curve-constants': args.curveConstants = true; break;
      default:
        console.error(`Unknown flag: ${argv[i]}`);
        process.exit(1);
    }
  }

  if (!args.schema || !args.lang || !args.out) {
    console.error(`Usage: generate.ts --schema <file> --lang <lang> --out <dir> [flags]

Required:
  --schema <file>    JSON schema file
  --lang <lang>      Target language (ts, rust, zig, cpp)
  --out <dir>        Output directory

Optional:
  --server                 Generate server dispatch
  --client                 Generate client
  --skeleton <dir>         Generate handler stubs + main (one-time)
  --prefix <str>           Type prefix (auto-detected if omitted)
  --cpp-namespace <ns>     C++ namespace (e.g. bb::wsdb)
  --cpp-wire-namespace <ns> Wire types sub-namespace (default: wire)
  --cpp-include-dir <path> Include path for generated dir (e.g. barretenberg/wsdb/generated)
  --curve-constants        Generate TS curve constants`);
    process.exit(1);
  }

  return args;
}

// ---------------------------------------------------------------------------
// Schema loading
// ---------------------------------------------------------------------------

function computeSchemaHash(schemaJson: string): string {
  return createHash('sha256').update(schemaJson).digest('hex');
}

function loadSchema(schemaPath: string): { compiled: CompiledSchema; schemaHash: string } {
  const rawJson = readFileSync(schemaPath, 'utf-8').trim();
  const schema = JSON.parse(rawJson);
  const visitor = new SchemaVisitor();
  const compiled = visitor.visit(schema.commands, schema.responses);
  const schemaHash = computeSchemaHash(rawJson);
  return { compiled, schemaHash };
}

/** Detect common prefix from command names (e.g. WsdbGetTreeInfo, WsdbCreateFork → Wsdb) */
function detectPrefix(compiled: CompiledSchema): string {
  const names = compiled.commands.map(c => c.name);
  if (names.length === 0) return '';
  let prefix = names[0];
  for (const name of names.slice(1)) {
    while (prefix && !name.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  const words = prefix.match(/[A-Z][a-z]*/g) || [];
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

// ---------------------------------------------------------------------------
// Template copying
// ---------------------------------------------------------------------------

function copyTemplate(lang: string, filename: string, outDir: string) {
  const templatePath = join(__dirname, '..', 'templates', lang, filename);
  const destPath = join(outDir, filename);
  writeFileSync(destPath, readFileSync(templatePath, 'utf-8'));
  console.log(`  ${destPath} (template)`);
}

// ---------------------------------------------------------------------------
// C++ clang-format
// ---------------------------------------------------------------------------

function formatCpp(files: string[]) {
  if (files.length === 0) return;
  try {
    execSync(`clang-format-20 -i ${files.join(' ')}`, { stdio: 'ignore' });
  } catch {
    // clang-format-20 may not be available
  }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function generate(args: Args) {
  const absSchema = resolve(args.schema);
  const absOut = resolve(args.out);
  mkdirSync(absOut, { recursive: true });

  const { compiled, schemaHash } = loadSchema(absSchema);
  const prefix = args.prefix || detectPrefix(compiled);

  console.log(`Schema: ${absSchema} (${compiled.commands.length} commands, prefix=${prefix})`);

  function writeFile(name: string, content: string) {
    const path = join(absOut, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`  ${path}`);
    return path;
  }

  const cppFiles: string[] = [];

  switch (args.lang) {
    case 'ts': {
      const gen = new TypeScriptCodegen();
      writeFile(`${toSnakeCase(prefix)}_types.ts`, gen.generateTypes(compiled, schemaHash));
      if (args.server) {
        writeFile(`${toSnakeCase(prefix)}_server.ts`, gen.generateServerApi(compiled));
        copyTemplate('ts', 'ipc_server.ts', absOut);
      }
      if (args.client) {
        writeFile(`${toSnakeCase(prefix)}_async.ts`, gen.generateAsyncApi(compiled));
        writeFile(`${toSnakeCase(prefix)}_sync.ts`, gen.generateSyncApi(compiled));
        copyTemplate('ts', 'ipc_client.ts', absOut);
      }
      if (args.curveConstants) {
        generateCurveConstants(absOut);
      }
      break;
    }
    case 'rust': {
      const gen = new RustCodegen({ prefix });
      writeFile(`${toSnakeCase(prefix)}_types.rs`, gen.generateTypes(compiled, schemaHash));
      if (args.server) {
        writeFile(`${toSnakeCase(prefix)}_server.rs`, gen.generateServer(compiled));
        copyTemplate('rust', 'ipc_server.rs', absOut);
      }
      if (args.client) {
        writeFile(`${toSnakeCase(prefix)}_client.rs`, gen.generateApi(compiled));
        copyTemplate('rust', 'ipc_client.rs', absOut);
      }
      break;
    }
    case 'zig': {
      const gen = new ZigCodegen({ prefix, clientName: `${prefix}Client` });
      writeFile(`${toSnakeCase(prefix)}_types.zig`, gen.generateTypes(compiled, schemaHash));
      if (args.server) {
        writeFile(`${toSnakeCase(prefix)}_server.zig`, gen.generateServer(compiled));
        copyTemplate('zig', 'ipc_server.zig', absOut);
      }
      if (args.client) {
        writeFile(`${toSnakeCase(prefix)}_client.zig`, gen.generateClient(compiled));
        copyTemplate('zig', 'ipc_client.zig', absOut);
      }
      break;
    }
    case 'cpp': {
      const ns = args.cppNamespace || prefix.toLowerCase();
      const wireNs = args.cppWireNamespace;
      const gen = new CppCodegen({
        namespace: ns,
        prefix,
        executeHeader: '',
        commandsHeader: '',
        wireNamespace: wireNs,
        generatedIncludeDir: args.cppIncludeDir,
      });

      cppFiles.push(writeFile(`${toSnakeCase(prefix)}_types.hpp`, gen.generateStandaloneTypes(compiled)));
      if (args.server) {
        cppFiles.push(writeFile(`${toSnakeCase(prefix)}_ipc_server.hpp`, gen.generateServerHeader(compiled)));
        copyTemplate('cpp', 'ipc_server.hpp', absOut);
      }
      if (args.client) {
        cppFiles.push(writeFile(`${toSnakeCase(prefix)}_ipc_client.hpp`, gen.generateHeader(compiled, schemaHash)));
        cppFiles.push(writeFile(`${toSnakeCase(prefix)}_ipc_client.cpp`, gen.generateImpl(compiled)));
        copyTemplate('cpp', 'ipc_client.hpp', absOut);
      }

      // Skeleton (one-time handler stubs + main)
      if (args.skeleton) {
        const skelDir = resolve(args.skeleton);
        mkdirSync(skelDir, { recursive: true });
        const handlersPath = join(skelDir, `${toSnakeCase(prefix)}_handlers.cpp`);
        const mainPath = join(skelDir, 'main.cpp');
        if (!existsSync(handlersPath)) {
          writeFileSync(handlersPath, gen.generateHandlerStubs(compiled));
          console.log(`  ${handlersPath} (skeleton)`);
          cppFiles.push(handlersPath);
        }
        if (!existsSync(mainPath)) {
          writeFileSync(mainPath, gen.generateMain(compiled));
          console.log(`  ${mainPath} (skeleton)`);
          cppFiles.push(mainPath);
        }
      }

      formatCpp(cppFiles);
      break;
    }
    default:
      console.error(`Unknown language: ${args.lang}. Available: ts, rust, zig, cpp`);
      process.exit(1);
  }

  console.log('Done.');
}

// ---------------------------------------------------------------------------
// Curve constants (special case for bb)
// ---------------------------------------------------------------------------

function hexToBigInt(hex: string): bigint { return BigInt('0x' + hex); }

function hexToByteList(hex: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substring(i, i + 2), 16));
  return `new Uint8Array([${bytes.join(', ')}])`;
}

function serializeCoordinate(coord: string | string[]): string {
  return Array.isArray(coord) ? `[${coord.map(c => hexToByteList(c)).join(', ')}]` : hexToByteList(coord);
}

function generateCurveConstants(outputDir: string) {
  const constantsPath = join(__dirname, '../schemas/bb_curve_constants.json');
  const constants = JSON.parse(readFileSync(constantsPath, 'utf-8'));
  const content = `// AUTOGENERATED FILE - DO NOT EDIT
export const BN254_FR_MODULUS = ${hexToBigInt(constants.bn254_fr_modulus)}n;
export const BN254_FQ_MODULUS = ${hexToBigInt(constants.bn254_fq_modulus)}n;
export const BN254_G1_GENERATOR = { x: ${serializeCoordinate(constants.bn254_g1_generator.x)}, y: ${serializeCoordinate(constants.bn254_g1_generator.y)} } as const;
export const BN254_G2_GENERATOR = { x: ${serializeCoordinate(constants.bn254_g2_generator.x)}, y: ${serializeCoordinate(constants.bn254_g2_generator.y)} } as const;
export const GRUMPKIN_FR_MODULUS = ${hexToBigInt(constants.grumpkin_fr_modulus)}n;
export const GRUMPKIN_FQ_MODULUS = ${hexToBigInt(constants.grumpkin_fq_modulus)}n;
export const GRUMPKIN_G1_GENERATOR = { x: ${serializeCoordinate(constants.grumpkin_g1_generator.x)}, y: ${serializeCoordinate(constants.grumpkin_g1_generator.y)} } as const;
export const SECP256K1_FR_MODULUS = ${hexToBigInt(constants.secp256k1_fr_modulus)}n;
export const SECP256K1_FQ_MODULUS = ${hexToBigInt(constants.secp256k1_fq_modulus)}n;
export const SECP256K1_G1_GENERATOR = { x: ${serializeCoordinate(constants.secp256k1_g1_generator.x)}, y: ${serializeCoordinate(constants.secp256k1_g1_generator.y)} } as const;
export const SECP256R1_FR_MODULUS = ${hexToBigInt(constants.secp256r1_fr_modulus)}n;
export const SECP256R1_FQ_MODULUS = ${hexToBigInt(constants.secp256r1_fq_modulus)}n;
export const SECP256R1_G1_GENERATOR = { x: ${serializeCoordinate(constants.secp256r1_g1_generator.x)}, y: ${serializeCoordinate(constants.secp256r1_g1_generator.y)} } as const;
`;
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'curve_constants.ts'), content);
  console.log(`  ${join(outputDir, 'curve_constants.ts')}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
generate(args);
