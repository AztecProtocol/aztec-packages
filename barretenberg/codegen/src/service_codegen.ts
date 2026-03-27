/**
 * Shared multi-service, multi-language code generation orchestrator.
 *
 * Each IPC service (bb, wsdb, cdb, avm) defines a ServiceConfig that specifies:
 *   - How to fetch its schema (binary path + env var override)
 *   - Which language generators to run and where to write output
 *   - Service-specific options for each generator (C++ namespace, prefix, etc.)
 *
 * Usage:
 *   import { generateForService, SERVICES } from './service_codegen.ts';
 *   await generateForService(SERVICES.wsdb);
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { SchemaVisitor, type CompiledSchema } from './schema_visitor.ts';
import { TypeScriptCodegen } from './typescript_codegen.ts';
import { RustCodegen, type RustCodegenOptions } from './rust_codegen.ts';
import { CppCodegen, type CppCodegenOptions } from './cpp_codegen.ts';
import { ZigCodegen, type ZigCodegenOptions } from './zig_codegen.ts';

/** Output file descriptor */
export interface OutputFile {
  /** Path relative to the service's base directory */
  path: string;
  content: string;
}

/** Language-specific generator configuration for a service */
export interface LanguageTarget {
  name: string;
  enabled: boolean;
  generate: (compiled: CompiledSchema, schemaHash: string) => OutputFile[];
}

/** Configuration for a single IPC service */
export interface ServiceConfig {
  /** Human-readable service name */
  name: string;
  /** Path to the committed schema JSON file (relative to cbindDir) */
  schemaFile: string;
  /** Base directory for output files (relative to cbindDir) */
  baseDir: string;
  /** Language targets for this service */
  targets: LanguageTarget[];
}

/**
 * Compute a SHA-256 hash of the raw schema JSON.
 * This serves as a schema version identifier — clients can check this
 * at connection time to detect incompatible schema changes.
 */
export function computeSchemaHash(schemaJson: string): string {
  return createHash('sha256').update(schemaJson).digest('hex');
}

/**
 * Load schema from a committed JSON file and compile it to the IR.
 */
export function loadAndCompileSchema(
  schemaPath: string,
  serviceName: string,
): { compiled: CompiledSchema; schemaHash: string; rawJson: string } {
  console.log(`Loading schema for ${serviceName} from ${schemaPath}...`);
  const rawJson = readFileSync(schemaPath, 'utf-8').trim();
  const schema = JSON.parse(rawJson);

  if (!schema.commands || !schema.responses) {
    throw new Error(`Invalid schema from ${serviceName}: missing commands or responses`);
  }

  const visitor = new SchemaVisitor();
  const compiled = visitor.visit(schema.commands, schema.responses);
  const schemaHash = computeSchemaHash(rawJson);

  console.log(
    `  ${compiled.commands.length} commands, ${compiled.structs.size} structs, hash=${schemaHash.slice(0, 12)}...`,
  );

  return { compiled, schemaHash, rawJson };
}

/**
 * Run code generation for a single service across all its language targets.
 */
export function generateForService(config: ServiceConfig, cbindDir: string): void {
  const schemaPath = join(cbindDir, config.schemaFile);

  if (!existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}. Run update_schemas.sh to generate it.`);
  }

  const { compiled, schemaHash } = loadAndCompileSchema(schemaPath, config.name);

  const baseDir = join(cbindDir, config.baseDir);

  for (const target of config.targets) {
    if (!target.enabled) {
      console.log(`  [skip] ${config.name}/${target.name}: disabled`);
      continue;
    }

    const files = target.generate(compiled, schemaHash);
    const cppFiles: string[] = [];

    for (const file of files) {
      const outputPath = join(baseDir, file.path);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, file.content);
      console.log(`  [${target.name}] ${outputPath}`);
      if (file.path.endsWith('.hpp') || file.path.endsWith('.cpp')) {
        cppFiles.push(outputPath);
      }
    }

    // Run clang-format on generated C++ files
    if (cppFiles.length > 0) {
      try {
        execSync(`clang-format-20 -i ${cppFiles.join(' ')}`, { stdio: 'ignore' });
      } catch {
        // clang-format-20 may not be available in all environments
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: create common TypeScript target
// ---------------------------------------------------------------------------
function tsTarget(): LanguageTarget {
  return {
    name: 'TypeScript',
    enabled: true,
    generate: (compiled, schemaHash) => {
      const tsGen = new TypeScriptCodegen();
      return [
        { path: 'generated/api_types.ts', content: tsGen.generateTypes(compiled, schemaHash) },
        { path: 'generated/async.ts', content: tsGen.generateAsyncApi(compiled) },
        { path: 'generated/server.ts', content: tsGen.generateServerApi(compiled) },
      ];
    },
  };
}

function tsTargetWithSync(): LanguageTarget {
  return {
    name: 'TypeScript',
    enabled: true,
    generate: (compiled, schemaHash) => {
      const tsGen = new TypeScriptCodegen();
      return [
        { path: 'generated/api_types.ts', content: tsGen.generateTypes(compiled, schemaHash) },
        { path: 'generated/sync.ts', content: tsGen.generateSyncApi(compiled) },
        { path: 'generated/async.ts', content: tsGen.generateAsyncApi(compiled) },
      ];
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: create common C++ IPC client target
// ---------------------------------------------------------------------------
function cppClientTarget(opts: CppCodegenOptions, cppOutputDir: string): LanguageTarget {
  return {
    name: 'C++ client',
    enabled: true,
    generate: (compiled, schemaHash) => {
      const cppGen = new CppCodegen(opts);
      return [
        { path: cppOutputDir + '_ipc_client_generated.hpp', content: cppGen.generateHeader(compiled, schemaHash) },
        { path: cppOutputDir + '_ipc_client_generated.cpp', content: cppGen.generateImpl(compiled) },
      ];
    },
  };
}

function cppServerTarget(opts: CppCodegenOptions, cppOutputDir: string): LanguageTarget {
  return {
    name: 'C++ server',
    enabled: true,
    generate: (compiled, _schemaHash) => {
      const cppGen = new CppCodegen(opts);
      return [
        { path: cppOutputDir + '_ipc_server_generated.hpp', content: cppGen.generateServerHeader(compiled) },
        { path: cppOutputDir + '_ipc_server_generated.cpp', content: cppGen.generateServerImpl(compiled) },
      ];
    },
  };
}

function cppStandaloneTypesTarget(opts: CppCodegenOptions, outputPath: string): LanguageTarget {
  return {
    name: 'C++ types',
    enabled: true,
    generate: (compiled, _schemaHash) => {
      const cppGen = new CppCodegen(opts);
      return [
        { path: outputPath, content: cppGen.generateStandaloneTypes(compiled) },
      ];
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: create Rust target
// ---------------------------------------------------------------------------
function rustTarget(outputDir: string, opts?: RustCodegenOptions): LanguageTarget {
  return {
    name: 'Rust',
    enabled: true,
    generate: (compiled, schemaHash) => {
      const rustGen = new RustCodegen(opts);
      return [
        { path: `${outputDir}/generated_types.rs`, content: rustGen.generateTypes(compiled, schemaHash) },
        { path: `${outputDir}/api.rs`, content: rustGen.generateApi(compiled) },
        { path: `${outputDir}/server.rs`, content: rustGen.generateServer(compiled) },
      ];
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: create Zig target
// ---------------------------------------------------------------------------
function zigTarget(outputDir: string, opts?: ZigCodegenOptions): LanguageTarget {
  return {
    name: 'Zig',
    enabled: true,
    generate: (compiled, schemaHash) => {
      const zigGen = new ZigCodegen(opts);
      return [
        { path: `${outputDir}/generated_types.zig`, content: zigGen.generateTypes(compiled, schemaHash) },
        { path: `${outputDir}/client.zig`, content: zigGen.generateClient(compiled, schemaHash) },
        { path: `${outputDir}/server.zig`, content: zigGen.generateServer(compiled) },
      ];
    },
  };
}

// ---------------------------------------------------------------------------
// Service definitions
// ---------------------------------------------------------------------------

// All paths are relative to cbindDir (barretenberg/codegen/src/).
// Since codegen/src/ is at the same depth as ts/src/cbind/, most
// paths to cpp/, rust/, zig/ are unchanged from the old layout.
const TS_SRC = '../../ts/src';
const ZIG_IPC_BASE = '../../../zig/aztec-ipc/src';

/** The main bb binary — used for general barretenberg API */
const SCHEMAS = '../schemas';

const BB_SERVICE: ServiceConfig = {
  name: 'bb',
  schemaFile: `${SCHEMAS}/bb_schema.json`,
  baseDir: `${TS_SRC}/cbind`,
  targets: [
    tsTargetWithSync(),
    rustTarget('../../../rust/barretenberg-rs/src'),
  ],
};

const WSDB_CPP_OPTS: CppCodegenOptions = {
  namespace: 'bb::wsdb',
  prefix: 'Wsdb',
  executeHeader: 'barretenberg/wsdb/wsdb_execute.hpp',
  commandsHeader: 'barretenberg/wsdb/wsdb_commands.hpp',
};

const CDB_CPP_OPTS: CppCodegenOptions = {
  namespace: 'bb::cdb',
  prefix: 'Cdb',
  executeHeader: 'barretenberg/cdb/cdb_execute.hpp',
  commandsHeader: 'barretenberg/cdb/cdb_commands.hpp',
};

const AVM_CPP_OPTS: CppCodegenOptions = {
  namespace: 'bb::avm',
  prefix: 'Avm',
  executeHeader: 'barretenberg/avm/avm_execute.hpp',
  commandsHeader: 'barretenberg/avm/avm_commands.hpp',
};

/** World State Database service */
const WSDB_SERVICE: ServiceConfig = {
  name: 'wsdb',
  schemaFile: `${SCHEMAS}/wsdb_schema.json`,
  baseDir: `${TS_SRC}/aztec-wsdb`,
  targets: [
    tsTarget(),
    cppStandaloneTypesTarget(WSDB_CPP_OPTS, '../../../cpp/src/barretenberg/wsdb/wsdb_types_generated.hpp'),
    cppClientTarget(WSDB_CPP_OPTS, '../../../cpp/src/barretenberg/wsdb/wsdb'),
    cppServerTarget(WSDB_CPP_OPTS, '../../../cpp/src/barretenberg/wsdb/wsdb'),
    zigTarget(`${ZIG_IPC_BASE}/wsdb`, { prefix: 'Wsdb', clientName: 'WsdbClient' }),
  ],
};

/** Contract Database service */
const CDB_SERVICE: ServiceConfig = {
  name: 'cdb',
  schemaFile: `${SCHEMAS}/cdb_schema.json`,
  baseDir: `${TS_SRC}/aztec-cdb`,
  targets: [
    tsTarget(),
    cppStandaloneTypesTarget(CDB_CPP_OPTS, '../../../cpp/src/barretenberg/cdb/cdb_types_generated.hpp'),
    cppClientTarget(CDB_CPP_OPTS, '../../../cpp/src/barretenberg/cdb/cdb'),
    cppServerTarget(CDB_CPP_OPTS, '../../../cpp/src/barretenberg/cdb/cdb'),
    zigTarget(`${ZIG_IPC_BASE}/cdb`, { prefix: 'Cdb', clientName: 'CdbClient' }),
  ],
};

/** AVM Simulator service */
const AVM_SERVICE: ServiceConfig = {
  name: 'avm',
  schemaFile: `${SCHEMAS}/avm_schema.json`,
  baseDir: `${TS_SRC}/aztec-avm`,
  targets: [
    tsTarget(),
    cppStandaloneTypesTarget(AVM_CPP_OPTS, '../../../cpp/src/barretenberg/avm/avm_types_generated.hpp'),
    cppServerTarget(AVM_CPP_OPTS, '../../../cpp/src/barretenberg/avm/avm'),
    zigTarget(`${ZIG_IPC_BASE}/avm`, { prefix: 'Avm', clientName: 'AvmClient' }),
  ],
};

/** All service configurations, keyed by name */
export const SERVICES: Record<string, ServiceConfig> = {
  bb: BB_SERVICE,
  wsdb: WSDB_SERVICE,
  cdb: CDB_SERVICE,
  avm: AVM_SERVICE,
};
