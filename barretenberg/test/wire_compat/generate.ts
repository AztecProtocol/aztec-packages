/**
 * Generate echo service bindings in all four languages from schema.json.
 *
 * Run: npx tsx generate.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SchemaVisitor } from '../../ts/src/cbind/schema_visitor.js';
import { TypeScriptCodegen } from '../../ts/src/cbind/typescript_codegen.js';
import { RustCodegen } from '../../ts/src/cbind/rust_codegen.js';
import { ZigCodegen } from '../../ts/src/cbind/zig_codegen.js';

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

// --- Zig ---
console.log('Zig:');
const zigGen = new ZigCodegen({ prefix: 'Echo', clientName: 'EchoClient' });
writeFile('zig/generated_types.zig', zigGen.generateTypes(compiled));
writeFile('zig/client.zig', zigGen.generateClient(compiled));
writeFile('zig/server.zig', zigGen.generateServer(compiled));

console.log('\nDone.');
