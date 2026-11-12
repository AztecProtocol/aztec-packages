/**
 * Generates the Node JSON-RPC API reference markdown from TypeScript source.
 *
 * Uses the TypeScript Compiler API to parse interface files and extract:
 * - JSDoc comments (descriptions, @param, @returns)
 * - Method signatures (parameter names and types)
 * - Schema object keys (to enumerate all RPC-exposed methods)
 *
 * No runtime imports of yarn-project modules — everything is extracted from source AST.
 */
import type * as TS from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { generateDocument, METHOD_GROUPS, type MethodInfo, type MethodJSDoc } from './node_api_reference_document.mts';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): { yarnProject: string; output: string } {
  const args = process.argv.slice(2);
  let yarnProject = '';
  let output = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--yarn-project' && args[i + 1]) {
      yarnProject = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[++i];
    }
  }
  if (!yarnProject || !output) {
    console.error('Usage: generate_node_api_reference.mts --yarn-project <path> --output <path>');
    process.exit(1);
  }
  return { yarnProject, output };
}

// ---------------------------------------------------------------------------
// JSDoc extraction via TypeScript Compiler API
// ---------------------------------------------------------------------------

function extractJSDocComment(tag: { comment?: string | TS.NodeArray<TS.JSDocComment> }): string {
  if (!tag.comment) return '';
  if (typeof tag.comment === 'string') return tag.comment;
  // biome-ignore lint/suspicious/noExplicitAny: baselined 2026-11-12: untyped external data
  return tag.comment.map((part: any) => part.text || '').join('');
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: baselined 2026-11-12: predates the complexity budget
function extractJSDocFromNode(node: TS.Node): MethodJSDoc | undefined {
  // biome-ignore lint/suspicious/noExplicitAny: baselined 2026-11-12: untyped external data
  const jsDocs = (node as any).jsDoc as TS.JSDoc[] | undefined;
  if (!jsDocs || jsDocs.length === 0) return undefined;

  const jsDoc = jsDocs[0];
  const description = extractJSDocComment(jsDoc);

  const params: { name: string; description: string }[] = [];
  let returns = '';
  let deprecated: string | undefined;
  let remarks: string | undefined;

  if (jsDoc.tags) {
    for (const tag of jsDoc.tags) {
      const tagComment = extractJSDocComment(tag);

      if (ts.isJSDocParameterTag(tag)) {
        const paramName = tag.name?.getText() || '';
        const paramDesc = tagComment.replace(/^\s*-\s*/, '').trim();
        params.push({ name: paramName, description: paramDesc });
      } else if (tag.tagName.text === 'returns') {
        returns = tagComment.replace(/^\s*-\s*/, '').trim();
      } else if (tag.tagName.text === 'deprecated') {
        deprecated = tagComment.trim() || 'This method is deprecated.';
      } else if (tag.tagName.text === 'remarks') {
        remarks = tagComment.trim();
      }
    }
  }

  return { description: description.trim(), params, returns, deprecated, remarks };
}

/** Extract JSDoc and parameter names from all method signatures in all interfaces in a file. */
function parseInterfaceFile(filePath: string): {
  jsdoc: Map<string, MethodJSDoc>;
  paramNames: Map<string, string[]>;
} {
  const jsdoc = new Map<string, MethodJSDoc>();
  const paramNames = new Map<string, string[]>();

  const sourceText = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: baselined 2026-11-12: predates the complexity budget
  function visit(node: TS.Node) {
    if (ts.isInterfaceDeclaration(node)) {
      for (const member of node.members) {
        const name = member.name?.getText(sourceFile);
        if (!name) continue;

        const doc = extractJSDocFromNode(member);
        if (doc) jsdoc.set(name, doc);

        if (ts.isMethodSignature(member) && member.parameters) {
          paramNames.set(name, member.parameters.map(p => p.name.getText(sourceFile)));
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { jsdoc, paramNames };
}

// ---------------------------------------------------------------------------
// Schema AST parsing — extract method names and Zod type signatures
// ---------------------------------------------------------------------------

/**
 * Parse a schema object literal (e.g., AztecNodeApiSchema = { ... }) from source,
 * extracting method names and simplified type info from the Zod expressions.
 */
function parseSchemaFile(
  filePath: string,
  schemaName: string,
): Map<string, { paramTypes: string[]; returnType: string }> {
  const result = new Map<string, { paramTypes: string[]; returnType: string }>();
  const sourceText = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  function visit(node: TS.Node) {
    // Look for: export const SchemaName: ... = { ... }
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.length > 0
    ) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === schemaName &&
          decl.initializer &&
          ts.isObjectLiteralExpression(decl.initializer)
        ) {
          parseSchemaObject(decl.initializer, sourceFile, result);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

function parseSchemaObject(
  obj: TS.ObjectLiteralExpression,
  sourceFile: TS.SourceFile,
  result: Map<string, { paramTypes: string[]; returnType: string }>,
) {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name?.getText(sourceFile);
    if (!name) continue;

    // The value is a Zod expression like z.function({ input: z.tuple([...]), output: ... })
    const exprText = prop.initializer.getText(sourceFile);
    const info = parseZodFunctionExpr(exprText);
    result.set(name, info);
  }
}

/**
 * Parse a Zod function expression string to extract simplified parameter types and return type.
 *
 * Handles the Zod 4 object form used by the schemas, and falls back to the legacy Zod 3
 * `.args().returns()` chain so older versioned-docs schemas still regenerate.
 *
 * Examples:
 *   "z.function({ input: z.tuple([BlockParameterSchema, schemas.Fr]), output: schemas.Fr })"
 *   "z.function({ input: z.tuple([]), output: z.boolean() })"
 *   "z.function().args(z.number(), optional(z.boolean())).returns(z.void())"  // legacy
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: baselined 2026-11-12: predates the complexity budget
function parseZodFunctionExpr(expr: string): { paramTypes: string[]; returnType: string } {
  // Normalize whitespace (multi-line expressions use \n + indentation)
  const normalized = expr.replace(/\s+/g, ' ').trim();

  // Zod 4 form: z.function({ input: z.tuple([...]), output: <expr> })
  const fnStart = normalized.indexOf('z.function(');
  if (fnStart !== -1) {
    const objStart = normalized.indexOf('{', fnStart);
    if (objStart !== -1) {
      const objEnd = findMatchingBracket(normalized, objStart);
      if (objEnd !== -1) {
        let inputExpr: string | undefined;
        let outputExpr: string | undefined;
        for (const entry of splitTopLevelArgs(normalized.substring(objStart + 1, objEnd))) {
          const colon = findTopLevelColon(entry);
          if (colon === -1) continue;
          const key = entry.substring(0, colon).trim();
          const value = entry.substring(colon + 1).trim();
          if (key === 'input') inputExpr = value;
          else if (key === 'output') outputExpr = value;
        }
        if (inputExpr !== undefined || outputExpr !== undefined) {
          return {
            paramTypes: inputExpr ? parseInputArgs(inputExpr) : [],
            returnType: outputExpr ? simplifyZodType(outputExpr) : 'void',
          };
        }
      }
    }
  }

  // Legacy Zod 3 form: z.function().args(...).returns(...)
  const paramTypes: string[] = [];
  let returnType = 'void';

  const argsStart = normalized.indexOf('.args(');
  if (argsStart !== -1) {
    const argsContentStart = argsStart + '.args('.length;
    const argsEnd = findMatchingParen(normalized, argsContentStart - 1);
    if (argsEnd !== -1) {
      const argsContent = normalized.substring(argsContentStart, argsEnd).trim();
      if (argsContent) {
        paramTypes.push(...splitTopLevelArgs(argsContent).map(simplifyZodType));
      }
    }
  }

  const returnsStart = normalized.indexOf('.returns(');
  if (returnsStart !== -1) {
    const returnsContentStart = returnsStart + '.returns('.length;
    const returnsEnd = findMatchingParen(normalized, returnsContentStart - 1);
    if (returnsEnd !== -1) {
      returnType = simplifyZodType(normalized.substring(returnsContentStart, returnsEnd).trim());
    }
  }

  return { paramTypes, returnType };
}

/**
 * Extract the parameter type list from a Zod 4 `input:` value, which is normally a
 * `z.tuple([...])`. Each tuple element is simplified independently so per-parameter docs
 * (names + types) line up with the interface signature.
 */
function parseInputArgs(inputExpr: string): string[] {
  const e = inputExpr.trim();

  const optionalWrapperMatch = e.match(/^optional\(([\s\S]+)\)$/);
  if (optionalWrapperMatch) return parseInputArgs(optionalWrapperMatch[1]);

  const tupleStart = e.indexOf('z.tuple(');
  if (tupleStart !== -1) {
    const bracketOpen = e.indexOf('[', tupleStart);
    if (bracketOpen !== -1) {
      const bracketClose = findMatchingBracket(e, bracketOpen);
      if (bracketClose !== -1) {
        const inner = e.substring(bracketOpen + 1, bracketClose).trim();
        if (!inner) return [];
        return splitTopLevelArgs(inner).map(simplifyZodType);
      }
    }
  }

  // Non-tuple input (rare) — treat the whole expression as a single parameter.
  return [simplifyZodType(e)];
}

/**
 * Find the position of the closing paren that matches the opening paren at `openPos`.
 * Returns the index of the closing paren, or -1 if not found.
 */
function findMatchingParen(text: string, openPos: number): number {
  let depth = 0;
  for (let i = openPos; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Find the index of the bracket matching the opener at `openPos` (one of `(` `[` `{`).
 * Returns the index of the matching closer, or -1 if not found.
 */
function findMatchingBracket(text: string, openPos: number): number {
  const open = text[openPos];
  const close = open === '(' ? ')' : open === '[' ? ']' : open === '{' ? '}' : '';
  if (!close) return -1;
  let depth = 0;
  for (let i = openPos; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the first top-level `:` (depth 0 across `()`, `[]`, `{}`), or -1. */
function findTopLevelColon(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0) return i;
  }
  return -1;
}

/**
 * Split comma-separated arguments at the top level (respecting nested parentheses and brackets).
 */
function splitTopLevelArgs(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of text) {
    if (char === '(' || char === '[' || char === '{') depth++;
    else if (char === ')' || char === ']' || char === '}') depth--;

    if (char === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) args.push(trimmed);
      current = '';
    } else {
      current += char;
    }
  }
  const trimmed = current.trim();
  if (trimmed) args.push(trimmed);
  return args;
}

/**
 * Simplify a Zod type expression into a human-readable type string.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: baselined 2026-11-12: predates the complexity budget
function simplifyZodType(expr: string): string {
  const e = expr.trim();

  // Optional handling must run first so `.optional()` suffixes aren't swallowed by
  // broader patterns below (e.g. `^(\w+)\.schema\b` would otherwise strip the optional
  // from expressions like `L2Block.schema.optional()`).
  if (e.endsWith('.optional()')) {
    return simplifyZodType(e.replace(/\.optional\(\)$/, '')) + ' | undefined';
  }
  const optionalWrapperMatch = e.match(/^optional\(([\s\S]+)\)$/);
  if (optionalWrapperMatch) return simplifyZodType(optionalWrapperMatch[1]) + ' | undefined';

  // Simple types
  if (e === 'z.string()') return 'string';
  if (e === 'z.number()') return 'number';
  if (e === 'z.boolean()') return 'boolean';
  if (e === 'z.void()') return 'void';
  if (e === 'z.bigint()') return 'bigint';

  // schemas.* references
  if (e === 'schemas.Fr') return 'Fr';
  if (e === 'schemas.AztecAddress') return 'AztecAddress';
  if (e === 'schemas.EthAddress') return 'EthAddress';
  if (e === 'schemas.BigInt') return 'bigint';
  if (e === 'schemas.SlotNumber') return 'SlotNumber';

  // Branded type schemas
  if (e === 'BlockNumberSchema') return 'number';
  if (e === 'BlockNumberPositiveSchema') return 'number';
  if (e === 'CheckpointNumberSchema') return 'number';
  if (e === 'CheckpointNumberPositiveSchema') return 'number';
  if (e === 'EpochNumberSchema') return 'number';
  if (e === 'BlockParameterSchema') return 'BlockHash | number | "latest"';
  if (e === 'ArchiveBlockParameterSchema') return '{ archive: Fr }';

  // Known schema objects
  if (e === 'ChainTipsSchema') return 'ChainTips';
  if (e === 'ChainTipSchema') return 'ChainTip';
  if (e === 'WorldStateSyncStatusSchema') return 'WorldStateSyncStatus';
  if (e === 'NodeInfoSchema') return 'NodeInfo';
  if (e === 'L1ContractAddressesSchema') return 'L1ContractAddresses';
  if (e === 'ProtocolContractAddressesSchema') return 'ProtocolContractAddresses';
  if (e === 'ValidatorsStatsSchema') return 'ValidatorsStats';
  if (e === 'TxValidationResultSchema') return 'TxValidationResult';
  if (e === 'LogFilterSchema') return 'LogFilter';
  if (e === 'GetPublicLogsResponseSchema') return 'GetPublicLogsResponse';
  if (e === 'GetContractClassLogsResponseSchema') return 'GetContractClassLogsResponse';
  if (e === 'ContractClassPublicSchema') return 'ContractClassPublic';
  if (e === 'ContractInstanceWithAddressSchema') return 'ContractInstanceWithAddress';
  if (e === 'OffenseSchema') return 'Offense';
  if (e === 'AllowedElementSchema') return 'AllowedElement';
  if (e === 'CheckpointDataSchema') return 'CheckpointData';

  // Class schemas: ClassName.schema
  const classSchemaMatch = e.match(/^(\w+)\.schema$/);
  if (classSchemaMatch) return classSchemaMatch[1];

  // TxHash.schema, L2Block.schema, etc
  const classSchemaMatch2 = e.match(/^(\w+)\.schema\b/);
  if (classSchemaMatch2) return classSchemaMatch2[1];

  // z.array(...) — use balanced paren matching to extract inner type
  if (e.startsWith('z.array(')) {
    const innerEnd = findMatchingParen(e, 8 - 1); // 8 = 'z.array('.length, -1 to point at '('
    if (innerEnd !== -1) {
      const inner = simplifyZodType(e.substring(8, innerEnd));
      // Parenthesize unions so `optional(Foo)` inside an array renders as `(Foo | undefined)[]`,
      // not the (incorrectly parsed) `Foo | undefined[]`.
      const wrapped = inner.includes('|') ? `(${inner})` : inner;
      return wrapped + '[]';
    }
  }

  // z.nativeEnum(X)
  const nativeEnumMatch = e.match(/^z\.nativeEnum\((\w+)\)$/);
  if (nativeEnumMatch) return nativeEnumMatch[1];

  // z.literal(X)
  const literalMatch = e.match(/^z\.literal\((.+)\)$/);
  if (literalMatch) return literalMatch[1];

  // z.union([...])
  const unionMatch = e.match(/^z\.union\(\[([\s\S]+)\]\)$/);
  if (unionMatch) {
    return splitTopLevelArgs(unionMatch[1]).map(simplifyZodType).join(' | ');
  }

  // z.tuple([...])
  const tupleMatch = e.match(/^z\.tuple\(\[([\s\S]+)\]\)$/);
  if (tupleMatch) {
    const items = splitTopLevelArgs(tupleMatch[1]).map(simplifyZodType);
    return `[${items.join(', ')}]`;
  }

  // z.object({...})
  if (e.startsWith('z.object(')) return 'object';

  // z.number().gt(X).lte(Y) etc
  if (e.startsWith('z.number()')) return 'number';
  if (e.startsWith('z.string()')) return 'string';
  if (e.startsWith('z.bigint()')) return 'bigint';

  // SiblingPath.schemaFor(X)
  if (e.startsWith('SiblingPath.schemaFor(')) return 'SiblingPath';

  // MembershipWitness.schemaFor(X)
  if (e.startsWith('MembershipWitness.schemaFor(')) return 'MembershipWitness';

  // NullifierMembershipWitness.schema
  if (e.includes('NullifierMembershipWitness')) return 'NullifierMembershipWitness';

  // PublicDataWitness.schema
  if (e.includes('PublicDataWitness')) return 'PublicDataWitness';

  // dataInBlockSchemaFor(X)
  if (e.startsWith('dataInBlockSchemaFor(')) {
    const innerMatch = e.match(/dataInBlockSchemaFor\(([\s\S]+)\)/);
    if (innerMatch) return `DataInBlock<${simplifyZodType(innerMatch[1])}>`;
  }

  // indexedTxSchema()
  if (e.startsWith('indexedTxSchema(')) return 'IndexedTxEffect';

  // Schema references ending in Schema
  const schemaRefMatch = e.match(/^(\w+)Schema$/);
  if (schemaRefMatch) {
    // Convert FooBarSchema to FooBar
    return schemaRefMatch[1];
  }

  // Admin config schemas
  if (e.includes('ConfigSchema')) return 'object';

  // Fallback — surface unrecognized expressions so they can be added to the mapping.
  console.warn(`[simplifyZodType] unrecognized expression, falling back to 'object': ${e}`);
  return 'object';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: baselined 2026-11-12: predates the complexity budget
function main(yarnProject: string, output: string) {
  const nodeInterfacePath = path.join(yarnProject, 'stdlib/src/interfaces/aztec-node.ts');
  const adminInterfacePath = path.join(yarnProject, 'stdlib/src/interfaces/aztec-node-admin.ts');
  const blockSourcePath = path.join(yarnProject, 'stdlib/src/block/l2_block_source.ts');

  // Phase A: Extract JSDoc and param names from interfaces
  console.log('Phase A: Extracting JSDoc comments and parameter names...');
  const nodeInterface = parseInterfaceFile(nodeInterfacePath);
  const adminInterface = parseInterfaceFile(adminInterfacePath);
  const blockSource = parseInterfaceFile(blockSourcePath);

  // Merge: block source JSDoc used as fallback for inherited methods
  const mergedJSDoc = new Map<string, MethodJSDoc>();
  for (const [name, doc] of blockSource.jsdoc) mergedJSDoc.set(name, doc);
  for (const [name, doc] of nodeInterface.jsdoc) mergedJSDoc.set(name, doc);

  const mergedParamNames = new Map<string, string[]>();
  for (const [name, params] of blockSource.paramNames) mergedParamNames.set(name, params);
  for (const [name, params] of nodeInterface.paramNames) mergedParamNames.set(name, params);

  // Phase B: Parse Zod schemas from source AST
  console.log('Phase B: Parsing Zod schema definitions...');
  const nodeSchemaInfo = parseSchemaFile(nodeInterfacePath, 'AztecNodeApiSchema');
  const adminSchemaInfo = parseSchemaFile(adminInterfacePath, 'AztecNodeAdminApiSchema');

  const nodeMethodNames = [...nodeSchemaInfo.keys()];
  const adminMethodNames = [...adminSchemaInfo.keys()];

  console.log(`  Found ${nodeMethodNames.length} node methods, ${adminMethodNames.length} admin methods`);

  // Phase C: Combine and generate
  console.log('Phase C: Generating markdown...');

  const allMethods = new Map<string, MethodInfo>();

  for (const name of nodeMethodNames) {
    const schema = nodeSchemaInfo.get(name)!;
    const jsdoc = mergedJSDoc.get(name) || { description: '', params: [], returns: '' };
    if (!mergedJSDoc.has(name)) {
      console.warn(`WARNING: aztec_${name} is missing JSDoc — rendered without description`);
    }
    const paramNames = mergedParamNames.get(name) || [];

    allMethods.set(`aztec:${name}`, {
      name,
      namespace: 'aztec',
      jsdoc,
      paramTypes: schema.paramTypes,
      paramNames: paramNames.length > 0 ? paramNames : schema.paramTypes.map((_, i) => `param${i + 1}`),
      returnType: schema.returnType,
    });
  }

  for (const name of adminMethodNames) {
    const schema = adminSchemaInfo.get(name)!;
    const jsdoc = adminInterface.jsdoc.get(name) || { description: '', params: [], returns: '' };
    if (!adminInterface.jsdoc.has(name)) {
      console.warn(`WARNING: aztecAdmin_${name} is missing JSDoc — rendered without description`);
    }
    const paramNames = adminInterface.paramNames.get(name) || [];

    allMethods.set(`aztecAdmin:${name}`, {
      name,
      namespace: 'aztecAdmin',
      jsdoc,
      paramTypes: schema.paramTypes,
      paramNames: paramNames.length > 0 ? paramNames : schema.paramTypes.map((_, i) => `param${i + 1}`),
      returnType: schema.returnType,
    });
  }

  const markdown = generateDocument(allMethods, { aztec: nodeMethodNames, aztecAdmin: adminMethodNames });
  fs.writeFileSync(output, markdown, 'utf-8');
  console.log(`Written to ${output}`);

  // Report ungrouped methods
  const allGrouped = new Set<string>();
  for (const group of METHOD_GROUPS) {
    for (const m of group.methods) allGrouped.add(`${group.namespace}:${m}`);
  }
  const allKeys = [
    ...nodeMethodNames.map((m) => `aztec:${m}`),
    ...adminMethodNames.map((m) => `aztecAdmin:${m}`),
  ];
  const ungrouped = allKeys.filter((k) => !allGrouped.has(k));
  if (ungrouped.length > 0) {
    console.warn(`\nWARNING: ${ungrouped.length} ungrouped method(s) (rendered in "Other methods"):`);
    for (const k of ungrouped) console.warn(`  - ${k.replace(':', '_')}`);
    console.warn('Update METHOD_GROUPS in node_api_reference_document.mts to categorize them.');
  }

  // Report methods in config but missing from schema
  for (const group of METHOD_GROUPS) {
    for (const m of group.methods) {
      if (!allMethods.has(`${group.namespace}:${m}`)) {
        console.warn(`WARNING: ${group.namespace}_${m} is in METHOD_GROUPS but not in schema`);
      }
    }
  }

  console.log( `\nTotal: ${nodeMethodNames.length} aztec_ + ${adminMethodNames.length} aztecAdmin_ = ${nodeMethodNames.length + adminMethodNames.length} methods`);
}

const { yarnProject, output } = parseArgs();
// Loaded after the argument check, so the usage error needs no install.
const { default: ts } = await import('typescript');
main(yarnProject, output);
