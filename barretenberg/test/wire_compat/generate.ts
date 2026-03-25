/**
 * Generate echo service bindings in all four languages from schema.json.
 *
 * Run: node --experimental-strip-types --experimental-transform-types generate.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SchemaVisitor } from '../../codegen/src/schema_visitor.ts';
import { TypeScriptCodegen } from '../../codegen/src/typescript_codegen.ts';
import { RustCodegen } from '../../codegen/src/rust_codegen.ts';
import { ZigCodegen } from '../../codegen/src/zig_codegen.ts';
import { CppCodegen } from '../../codegen/src/cpp_codegen.ts';

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

const schema = JSON.parse(readFileSync(join(__dirname, 'schema.json'), 'utf-8'));
const visitor = new SchemaVisitor();
const compiled = visitor.visit(schema.commands, schema.responses);

console.log(`Echo schema: ${compiled.commands.length} commands, ${compiled.structs.size} structs\n`);

function writeFile(relPath: string, content: string) {
  const fullPath = join(__dirname, relPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  console.log(`  ${relPath}`);
}

// --- TypeScript ---
console.log('TypeScript:');
const tsGen = new TypeScriptCodegen();
writeFile('ts/generated/api_types.ts', tsGen.generateTypes(compiled));
writeFile('ts/generated/async.ts', tsGen.generateAsyncApi(compiled));
writeFile('ts/generated/server.ts', tsGen.generateServerApi(compiled));

// --- Rust ---
console.log('Rust:');
const rustGen = new RustCodegen({
  prefix: 'Echo',
  apiStructName: 'EchoApi',
  backendImport: 'crate::backend::Backend',
  errorImport: 'crate::error::{EchoError, Result}',
  typesImport: 'crate::generated_types::*',
  typesDocComment: 'Generated types for echo test service',
  apiDocComment: 'Echo test service API',
});
writeFile('rust/src/generated_types.rs', rustGen.generateTypes(compiled));
writeFile('rust/src/api.rs', rustGen.generateApi(compiled));
writeFile('rust/src/server.rs', rustGen.generateServer(compiled));

// --- C++ ---
console.log('C++:');
const cppGen = new CppCodegen({
  namespace: 'echo',
  prefix: 'Echo',
  executeHeader: 'echo_execute.hpp',
  commandsHeader: 'echo_commands.hpp',
});
// Standalone types — no barretenberg dependencies, just msgpack-c
writeFile('cpp/generated/echo_types.hpp', cppGen.generateStandaloneTypes(compiled));

// --- Zig ---
console.log('Zig:');
const zigGen = new ZigCodegen({ prefix: 'Echo', clientName: 'EchoClient' });
writeFile('zig/generated/generated_types.zig', zigGen.generateTypes(compiled));
writeFile('zig/generated/client.zig', zigGen.generateClient(compiled));
writeFile('zig/generated/server.zig', zigGen.generateServer(compiled));

console.log('\nDone.');
