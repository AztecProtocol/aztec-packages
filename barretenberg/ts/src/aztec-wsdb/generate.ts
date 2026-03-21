/**
 * Code generation for aztec-wsdb TypeScript bindings.
 *
 * Uses the same codegen pipeline as bb.js but targets the aztec-wsdb binary schema.
 * Run: npx tsx src/aztec-wsdb/generate.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { SchemaVisitor } from '../cbind/schema_visitor.js';
import { TypeScriptCodegen } from '../cbind/typescript_codegen.js';
import { CppCodegen } from '../cbind/cpp_codegen.js';

const execAsync = promisify(exec);

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

async function generate() {
  const wsdbBuildPath = process.env.WSDB_BINARY_PATH || join(__dirname, '../../../cpp/build/bin/aztec-wsdb');

  // Get schema from aztec-wsdb
  console.log('Fetching msgpack schema from aztec-wsdb...');
  const { stdout } = await execAsync(`${wsdbBuildPath} msgpack schema`);
  const schema = JSON.parse(stdout.trim());

  if (!schema.commands || !schema.responses) {
    throw new Error('Invalid schema: missing commands or responses');
  }

  // Compile schema using the shared visitor
  console.log('Compiling schema...');
  const visitor = new SchemaVisitor();
  const compiled = visitor.visit(schema.commands, schema.responses);

  console.log(`Found ${compiled.commands.length} commands, ${compiled.structs.size} structs\n`);

  // Generate TypeScript bindings
  const tsGen = new TypeScriptCodegen();

  // Generate C++ IPC client
  const cppGen = new CppCodegen({
    namespace: 'bb::wsdb',
    prefix: 'Wsdb',
    executeHeader: 'barretenberg/wsdb/wsdb_execute.hpp',
    commandsHeader: 'barretenberg/wsdb/wsdb_commands.hpp',
  });

  const files = [
    { path: 'generated/api_types.ts', content: tsGen.generateTypes(compiled) },
    { path: 'generated/async.ts', content: tsGen.generateAsyncApi(compiled) },
    { path: '../../../cpp/src/barretenberg/wsdb/wsdb_ipc_client_generated.hpp', content: cppGen.generateHeader(compiled) },
    { path: '../../../cpp/src/barretenberg/wsdb/wsdb_ipc_client_generated.cpp', content: cppGen.generateImpl(compiled) },
  ];

  // Ensure output directory exists
  const outputDir = join(__dirname, 'generated');
  mkdirSync(outputDir, { recursive: true });

  const cppFiles: string[] = [];
  for (const file of files) {
    const outputPath = join(__dirname, file.path);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, file.content);
    console.log(`  ${outputPath}`);
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

  console.log('\nWsdb codegen complete.');
}

generate().catch(error => {
  console.error('Generation failed:', error);
  process.exit(1);
});
