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
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
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
// Helper: read a codegen template file
// ---------------------------------------------------------------------------
function readTemplate(lang: string, filename: string): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const templatePath = resolve(thisDir, '..', 'templates', lang, filename);
  return readFileSync(templatePath, 'utf-8');
}

// ---------------------------------------------------------------------------
// Helper: create common C++ IPC client target (uses standalone ipc_client.hpp template)
// ---------------------------------------------------------------------------
/**
 * C++ client target — generates typed IPC client + copies transport template.
 * @param opts Codegen options
 * @param generatedDir Output directory for generated files (e.g. '../../../cpp/src/barretenberg/wsdb/generated')
 * @param prefix File prefix (e.g. 'wsdb')
 */
function cppClientTarget(opts: CppCodegenOptions, generatedDir: string, prefix: string): LanguageTarget {
  return {
    name: 'C++ client',
    enabled: true,
    generate: (compiled, schemaHash) => {
      const cppGen = new CppCodegen(opts);
      return [
        { path: `${generatedDir}/ipc_client.hpp`, content: readTemplate('cpp', 'ipc_client.hpp') },
        { path: `${generatedDir}/${prefix}_ipc_client.hpp`, content: cppGen.generateHeader(compiled, schemaHash) },
        { path: `${generatedDir}/${prefix}_ipc_client.cpp`, content: cppGen.generateImpl(compiled) },
      ];
    },
  };
}

/**
 * C++ server target — generates dispatch handler + copies transport template.
 * @param opts Codegen options
 * @param generatedDir Output directory for generated files
 * @param prefix File prefix (e.g. 'wsdb')
 */
function cppServerTarget(opts: CppCodegenOptions, generatedDir: string, prefix: string): LanguageTarget {
  return {
    name: 'C++ server',
    enabled: true,
    generate: (compiled, _schemaHash) => {
      const cppGen = new CppCodegen(opts);
      return [
        { path: `${generatedDir}/ipc_server.hpp`, content: readTemplate('cpp', 'ipc_server.hpp') },
        { path: `${generatedDir}/${prefix}_ipc_server.hpp`, content: cppGen.generateServerHeader(compiled) },
        { path: `${generatedDir}/${prefix}_ipc_server.cpp`, content: cppGen.generateServerImpl(compiled) },
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

function cppCommandsTarget(opts: CppCodegenOptions, outputPath: string): LanguageTarget {
  return {
    name: 'C++ commands',
    enabled: true,
    generate: (compiled, _schemaHash) => {
      const cppGen = new CppCodegen(opts);
      return [
        { path: outputPath, content: cppGen.generateCommands(compiled) },
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
        { path: `${outputDir}/types_gen.rs`, content: rustGen.generateTypes(compiled, schemaHash) },
        { path: `${outputDir}/client_gen.rs`, content: rustGen.generateApi(compiled) },
        { path: `${outputDir}/server_gen.rs`, content: rustGen.generateServer(compiled) },
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

const BB_CPP_OPTS: CppCodegenOptions = {
  namespace: 'bb::bbapi',
  prefix: 'Bb',
  executeHeader: 'barretenberg/bbapi/bbapi_execute.hpp',
  // BB keeps hand-written commands (they use grumpkin::fr, affine_element, etc.)
  // The codegen generates only the server dispatch.
  commandsHeader: 'barretenberg/bbapi/bbapi_execute.hpp',
  generatedIncludeDir: 'barretenberg/bbapi/generated',
};

const BB_SERVICE: ServiceConfig = {
  name: 'bb',
  schemaFile: `${SCHEMAS}/bb_schema.json`,
  baseDir: `${TS_SRC}/cbind`,
  targets: [
    tsTargetWithSync(),
    rustTarget('../../../rust/barretenberg-rs/src'),
    cppStandaloneTypesTarget(BB_CPP_OPTS, '../../../cpp/src/barretenberg/bbapi/generated/bb_types.hpp'),
    cppServerTarget(BB_CPP_OPTS, '../../../cpp/src/barretenberg/bbapi/generated', 'bb'),
  ],
};

const WSDB_CPP_OPTS: CppCodegenOptions = {
  namespace: 'bb::wsdb',
  prefix: 'Wsdb',
  executeHeader: 'barretenberg/wsdb/wsdb_execute.hpp',
  commandsHeader: 'barretenberg/wsdb/generated/wsdb_commands.hpp',
  externals: {
    'WorldStateRevision': 'barretenberg/world_state/types.hpp',
    'WorldStateStatusFull': 'barretenberg/world_state/types.hpp',
    'WorldStateStatusSummary': 'barretenberg/world_state/types.hpp',
    'WorldStateDBStats': 'barretenberg/world_state/types.hpp',
    'WorldStateMeta': 'barretenberg/world_state/types.hpp',
    'NullifierLeafValue': 'barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp',
    'PublicDataLeafValue': 'barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp',
    'TreeMeta': 'barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp',
    'TreeDBStats': 'barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp',
    'DBStats': 'barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp',
    'SiblingPathAndIndex': 'barretenberg/crypto/merkle_tree/response.hpp',
  },
  usingNamespaces: ['bb::world_state', 'bb::crypto::merkle_tree'],
  additionalIncludes: [
    'barretenberg/crypto/merkle_tree/hash_path.hpp',
    'barretenberg/crypto/merkle_tree/response.hpp',
    'barretenberg/crypto/merkle_tree/types.hpp',
    'barretenberg/ecc/curves/bn254/fr.hpp',
    'barretenberg/serialize/msgpack.hpp',
    'barretenberg/world_state/fork.hpp',
  ],
};

const CDB_CPP_OPTS: CppCodegenOptions = {
  namespace: 'bb::cdb',
  prefix: 'Cdb',
  executeHeader: 'barretenberg/cdb/cdb_execute.hpp',
  commandsHeader: 'barretenberg/cdb/generated/cdb_commands.hpp',
  externals: {
    'ContractInstance': 'barretenberg/vm2/common/aztec_types.hpp',
    'ContractClass': 'barretenberg/vm2/common/aztec_types.hpp',
    'ContractDeploymentData': 'barretenberg/vm2/common/aztec_types.hpp',
    'ContractClassLogFields': 'barretenberg/vm2/common/aztec_types.hpp',
    'ContractClassLog': 'barretenberg/vm2/common/aztec_types.hpp',
    'PrivateLog': 'barretenberg/vm2/common/aztec_types.hpp',
    'GrumpkinPoint': 'barretenberg/vm2/common/aztec_types.hpp',
    'PublicKeys': 'barretenberg/vm2/common/aztec_types.hpp',
  },
  usingNamespaces: ['bb::avm2'],
  additionalIncludes: [
    'barretenberg/ecc/curves/bn254/fr.hpp',
    'barretenberg/serialize/msgpack.hpp',
  ],
};

const AVM_CPP_OPTS: CppCodegenOptions = {
  namespace: 'bb::avm',
  prefix: 'Avm',
  executeHeader: 'barretenberg/avm/avm_execute.hpp',
  commandsHeader: 'barretenberg/avm/generated/avm_commands.hpp',
};

/** World State Database service */
const WSDB_SERVICE: ServiceConfig = {
  name: 'wsdb',
  schemaFile: `${SCHEMAS}/wsdb_schema.json`,
  baseDir: `${TS_SRC}/aztec-wsdb`,
  targets: [
    tsTarget(),
    cppStandaloneTypesTarget(WSDB_CPP_OPTS, '../../../cpp/src/barretenberg/wsdb/generated/wsdb_types.hpp'),
    cppCommandsTarget(WSDB_CPP_OPTS, '../../../cpp/src/barretenberg/wsdb/generated/wsdb_commands.hpp'),
    cppClientTarget(WSDB_CPP_OPTS, '../../../cpp/src/barretenberg/wsdb/generated', 'wsdb'),
    cppServerTarget(WSDB_CPP_OPTS, '../../../cpp/src/barretenberg/wsdb/generated', 'wsdb'),
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
    cppStandaloneTypesTarget(CDB_CPP_OPTS, '../../../cpp/src/barretenberg/cdb/generated/cdb_types.hpp'),
    cppCommandsTarget(CDB_CPP_OPTS, '../../../cpp/src/barretenberg/cdb/generated/cdb_commands.hpp'),
    cppClientTarget(CDB_CPP_OPTS, '../../../cpp/src/barretenberg/cdb/generated', 'cdb'),
    cppServerTarget(CDB_CPP_OPTS, '../../../cpp/src/barretenberg/cdb/generated', 'cdb'),
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
    cppStandaloneTypesTarget(AVM_CPP_OPTS, '../../../cpp/src/barretenberg/avm/generated/avm_types.hpp'),
    cppCommandsTarget(AVM_CPP_OPTS, '../../../cpp/src/barretenberg/avm/generated/avm_commands.hpp'),
    cppServerTarget(AVM_CPP_OPTS, '../../../cpp/src/barretenberg/avm/generated', 'avm'),
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
