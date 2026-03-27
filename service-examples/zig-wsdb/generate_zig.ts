/**
 * Generate WSDB Zig types and server dispatch from committed schema.
 * Invoked by generate.sh — reads CODEGEN_DIR and OUT_DIR from env.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const codegen = process.env.CODEGEN_DIR!;
const outDir = process.env.OUT_DIR!;

const { SchemaVisitor } = await import(join(codegen, 'src/schema_visitor.ts'));
const { ZigCodegen } = await import(join(codegen, 'src/zig_codegen.ts'));
const { computeSchemaHash } = await import(join(codegen, 'src/service_codegen.ts'));

const schemaPath = join(codegen, 'schemas/wsdb_schema.json');
const rawJson = readFileSync(schemaPath, 'utf-8').trim();
const schema = JSON.parse(rawJson);
const visitor = new SchemaVisitor();
const compiled = visitor.visit(schema.commands, schema.responses);
const hash = computeSchemaHash(rawJson);

const zigGen = new ZigCodegen({ prefix: 'Wsdb', clientName: 'WsdbClient' });
writeFileSync(join(outDir, 'types.zig'), zigGen.generateTypes(compiled, hash));
writeFileSync(join(outDir, 'server.zig'), zigGen.generateServer(compiled));

console.log(`  ${compiled.commands.length} commands, ${compiled.structs.size} structs`);
console.log(`  -> ${outDir}/types.zig`);
console.log(`  -> ${outDir}/server.zig`);
