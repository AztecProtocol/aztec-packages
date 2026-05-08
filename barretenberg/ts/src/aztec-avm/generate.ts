/**
 * Code generation for aztec-avm TypeScript bindings.
 *
 * Uses the same codegen pipeline as bb.js but targets the aztec-avm binary schema.
 * Run: npx tsx src/aztec-avm/generate.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { SchemaVisitor } from '../cbind/schema_visitor.js';
import { TypeScriptCodegen } from '../cbind/typescript_codegen.js';

const execAsync = promisify(exec);

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

async function generate() {
  const avmBuildPath = process.env.AVM_BINARY_PATH || join(__dirname, '../../../cpp/build/bin/aztec-avm');

  // Get schema from aztec-avm
  console.log('Fetching msgpack schema from aztec-avm...');
  const { stdout } = await execAsync(`${avmBuildPath} msgpack schema`);
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
  const files = [
    { path: 'generated/api_types.ts', content: tsGen.generateTypes(compiled) },
    { path: 'generated/async.ts', content: tsGen.generateAsyncApi(compiled) },
  ];

  // Ensure output directory exists
  const outputDir = join(__dirname, 'generated');
  mkdirSync(outputDir, { recursive: true });

  for (const file of files) {
    const outputPath = join(__dirname, file.path);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, file.content);
    console.log(`  ${outputPath}`);
  }

  console.log('\nAvm codegen complete.');
}

generate().catch(error => {
  console.error('Generation failed:', error);
  process.exit(1);
});
