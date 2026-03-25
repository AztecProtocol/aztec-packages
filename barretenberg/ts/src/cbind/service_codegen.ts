/**
 * Shared multi-service, multi-language code generation orchestrator.
 *
 * Each IPC service (bb, wsdb, cdb, avm) defines a ServiceConfig that specifies:
 *   - How to fetch its schema (binary path + env var override)
 *   - Which language generators to run and where to write output
 *   - Service-specific options for each generator (C++ namespace, prefix, etc.)
 *
 * Usage:
 *   import { generateForService, SERVICES } from './service_codegen.js';
 *   await generateForService(SERVICES.wsdb);
 */

import { createHash } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SchemaVisitor, type CompiledSchema } from './schema_visitor.js';
import { TypeScriptCodegen } from './typescript_codegen.js';
import { RustCodegen, type RustCodegenOptions } from './rust_codegen.js';
import { CppCodegen, type CppCodegenOptions } from './cpp_codegen.js';
import { ZigCodegen, type ZigCodegenOptions } from './zig_codegen.js';

const execAsync = promisify(exec);

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
  /** Environment variable to override binary path */
  binaryEnvVar: string;
  /** Default binary path relative to cbind/ directory */
  defaultBinaryPath: string;
  /** Base directory for output files (relative to cbind/) */
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
 * Fetch schema from a service binary and compile it to the IR.
 * Returns both the compiled schema and the raw JSON hash for versioning.
 */
export async function fetchAndCompileSchema(
  binaryPath: string,
  serviceName: string,
): Promise<{ compiled: CompiledSchema; schemaHash: string; rawJson: string }> {
  console.log(`Fetching msgpack schema from ${serviceName}...`);
  const { stdout } = await execAsync(`${binaryPath} msgpack schema`);
  const rawJson = stdout.trim();
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
export async function generateForService(config: ServiceConfig, cbindDir: string): Promise<void> {
  const binaryPath = process.env[config.binaryEnvVar] || join(cbindDir, config.defaultBinaryPath);

  // Skip if binary not available (e.g., C++ not built yet).
  // Generated files from a prior build/cache may still be present.
  if (!existsSync(binaryPath)) {
    console.log(`  [skip] ${config.name}: binary not found at ${binaryPath}`);
    return;
  }

  const { compiled, schemaHash } = await fetchAndCompileSchema(binaryPath, config.name);

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
        await execAsync(`clang-format-20 -i ${cppFiles.join(' ')}`);
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

/** Zig output base for IPC clients */
const ZIG_IPC_BASE = '../../../zig/aztec-ipc/src';

/** The main bb binary — used for general barretenberg API */
const BB_SERVICE: ServiceConfig = {
  name: 'bb',
  binaryEnvVar: 'BB_BINARY_PATH',
  defaultBinaryPath: '../../cpp/build/bin/bb',
  baseDir: '.',
  targets: [
    tsTargetWithSync(),
    rustTarget('../../../rust/barretenberg-rs/src'),
  ],
};

/** Rust output base for IPC service crate */
const RUST_IPC_BASE = '../../../rust/aztec-ipc/src';

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

/** World State Database service */
const WSDB_SERVICE: ServiceConfig = {
  name: 'wsdb',
  binaryEnvVar: 'WSDB_BINARY_PATH',
  defaultBinaryPath: '../../cpp/build/bin/aztec-wsdb',
  baseDir: '../aztec-wsdb',
  targets: [
    tsTarget(),
    cppClientTarget(WSDB_CPP_OPTS, '../../../cpp/src/barretenberg/wsdb/wsdb'),
    cppServerTarget(WSDB_CPP_OPTS, '../../../cpp/src/barretenberg/wsdb/wsdb'),
    rustTarget(`${RUST_IPC_BASE}/wsdb`, {
      prefix: 'Wsdb',
      apiStructName: 'WsdbApi',
      backendImport: 'crate::backend::Backend',
      errorImport: 'crate::error::{IpcError, Result}',
      typesImport: 'super::generated_types::*',
      typesDocComment: 'Generated types for aztec-wsdb IPC protocol',
      apiDocComment: 'WSDB IPC client API',
    }),
    zigTarget(`${ZIG_IPC_BASE}/wsdb`, { prefix: 'Wsdb', clientName: 'WsdbClient' }),
  ],
};

/** Contract Database service */
const CDB_SERVICE: ServiceConfig = {
  name: 'cdb',
  binaryEnvVar: 'CDB_BINARY_PATH',
  defaultBinaryPath: '../../cpp/build/bin/aztec-cdb',
  baseDir: '../aztec-cdb',
  targets: [
    tsTarget(),
    cppClientTarget(CDB_CPP_OPTS, '../../../cpp/src/barretenberg/cdb/cdb'),
    cppServerTarget(CDB_CPP_OPTS, '../../../cpp/src/barretenberg/cdb/cdb'),
    rustTarget(`${RUST_IPC_BASE}/cdb`, {
      prefix: 'Cdb',
      apiStructName: 'CdbApi',
      backendImport: 'crate::backend::Backend',
      errorImport: 'crate::error::{IpcError, Result}',
      typesImport: 'super::generated_types::*',
      typesDocComment: 'Generated types for aztec-cdb IPC protocol',
      apiDocComment: 'CDB IPC client API',
    }),
    zigTarget(`${ZIG_IPC_BASE}/cdb`, { prefix: 'Cdb', clientName: 'CdbClient' }),
  ],
};

/** AVM Simulator service */
const AVM_SERVICE: ServiceConfig = {
  name: 'avm',
  binaryEnvVar: 'AVM_BINARY_PATH',
  defaultBinaryPath: '../../cpp/build/bin/aztec-avm',
  baseDir: '../aztec-avm',
  targets: [
    tsTarget(),
    rustTarget(`${RUST_IPC_BASE}/avm`, {
      prefix: 'Avm',
      apiStructName: 'AvmApi',
      backendImport: 'crate::backend::Backend',
      errorImport: 'crate::error::{IpcError, Result}',
      typesImport: 'super::generated_types::*',
      typesDocComment: 'Generated types for aztec-avm IPC protocol',
      apiDocComment: 'AVM IPC client API',
    }),
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
