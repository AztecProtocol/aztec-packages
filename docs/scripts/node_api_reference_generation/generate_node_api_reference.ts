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
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

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
    console.error('Usage: generate_node_api_reference.ts --yarn-project <path> --output <path>');
    process.exit(1);
  }
  return { yarnProject, output };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MethodJSDoc {
  description: string;
  params: { name: string; description: string }[];
  returns: string;
  deprecated?: string;
  remarks?: string;
}

interface MethodInfo {
  name: string;
  namespace: string;
  jsdoc: MethodJSDoc;
  paramNames: string[];
  paramTypes: string[];
  returnType: string;
}

// ---------------------------------------------------------------------------
// JSDoc extraction via TypeScript Compiler API
// ---------------------------------------------------------------------------

function extractJSDocComment(tag: { comment?: string | ts.NodeArray<ts.JSDocComment> }): string {
  if (!tag.comment) return '';
  if (typeof tag.comment === 'string') return tag.comment;
  return tag.comment.map((part: any) => part.text || '').join('');
}

function extractJSDocFromNode(node: ts.Node): MethodJSDoc | undefined {
  const jsDocs = (node as any).jsDoc as ts.JSDoc[] | undefined;
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

  function visit(node: ts.Node) {
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

  function visit(node: ts.Node) {
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
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  result: Map<string, { paramTypes: string[]; returnType: string }>,
) {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name?.getText(sourceFile);
    if (!name) continue;

    // The value is a Zod expression like z.function().args(...).returns(...)
    const exprText = prop.initializer.getText(sourceFile);
    const info = parseZodFunctionExpr(exprText);
    result.set(name, info);
  }
}

/**
 * Parse a Zod function expression string to extract simplified parameter types and return type.
 *
 * Examples:
 *   "z.function().args(BlockParameterSchema, schemas.Fr).returns(schemas.Fr)"
 *   "z.function().returns(z.boolean())"
 *   "z.function().args(z.number(), optional(z.boolean())).returns(z.void())"
 */
function parseZodFunctionExpr(expr: string): { paramTypes: string[]; returnType: string } {
  const paramTypes: string[] = [];
  let returnType = 'void';

  // Normalize whitespace (multi-line expressions use \n + indentation)
  const normalized = expr.replace(/\s+/g, ' ').trim();

  // Extract .args(...) content — match balanced parens for args
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

  // Extract .returns(...) content — match balanced parens for returns
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
// Markdown generation
// ---------------------------------------------------------------------------

/** Method grouping configuration. Methods are rendered in this order. */
const METHOD_GROUPS: { heading: string; namespace: string; methods: string[] }[] = [
  {
    heading: 'Block queries',
    namespace: 'node',
    methods: [
      'getBlockNumber',
      'getCheckpointNumber',
      'getChainTips',
      'getBlock',
      'getBlockData',
      'getBlocks',
      'getCheckpoint',
      'getCheckpoints',
      'getCheckpointsData',
    ],
  },
  {
    heading: 'Transaction operations',
    namespace: 'node',
    methods: [
      'sendTx',
      'getTxReceipt',
      'getTxEffect',
      'getTxByHash',
      'getTxsByHash',
      'getPendingTxs',
      'getPendingTxCount',
      'isValidTx',
      'simulatePublicCalls',
    ],
  },
  {
    heading: 'State queries',
    namespace: 'node',
    methods: ['getPublicStorageAt', 'getWorldStateSyncStatus'],
  },
  {
    heading: 'Membership witnesses',
    namespace: 'node',
    methods: [
      'findLeavesIndexes',
      'getNullifierMembershipWitness',
      'getLowNullifierMembershipWitness',
      'getPublicDataWitness',
      'getBlockHashMembershipWitness',
      'getNoteHashMembershipWitness',
    ],
  },
  {
    heading: 'L1 to L2 messages',
    namespace: 'node',
    methods: [
      'getL1ToL2MessageMembershipWitness',
      'getL1ToL2MessageCheckpoint',
      'getL2ToL1MembershipWitness',
      'getL2ToL1Messages',
    ],
  },
  {
    heading: 'Log queries',
    namespace: 'node',
    methods: [
      'getPublicLogs',
      'getContractClassLogs',
      'getPrivateLogsByTags',
      'getPublicLogsByTagsFromContract',
    ],
  },
  {
    heading: 'Contract queries',
    namespace: 'node',
    methods: ['getContractClass', 'getContract'],
  },
  {
    heading: 'Fee queries',
    namespace: 'node',
    methods: ['getCurrentMinFees', 'getPredictedMinFees', 'getMaxPriorityFees'],
  },
  {
    heading: 'Node information',
    namespace: 'node',
    methods: [
      'isReady',
      'getNodeInfo',
      'getNodeVersion',
      'getVersion',
      'getChainId',
      'getL1ContractAddresses',
      'getProtocolContractAddresses',
      'getEncodedEnr',
    ],
  },
  {
    heading: 'Validator queries',
    namespace: 'node',
    methods: ['getValidatorsStats', 'getValidatorStats'],
  },
  {
    heading: 'Debug operations',
    namespace: 'node',
    methods: ['registerContractFunctionSignatures', 'getAllowedPublicSetup'],
  },
  {
    heading: 'Admin API',
    namespace: 'nodeAdmin',
    methods: [
      'getConfig',
      'setConfig',
      'pauseSync',
      'resumeSync',
      'rollbackTo',
      'startSnapshotUpload',
      'getSlashOffenses',
      'reloadKeystore',
    ],
  },
];

function generateExampleParam(paramType: string, paramName?: string): string {
  const t = paramType.replace(/\s*\|\s*undefined$/, '').trim();

  // Name-aware overrides for common parameter names so paired numeric args like
  // (from, limit) and (page) render as more illustrative examples than `12345, 12345`.
  // `from` defaults to 1 because some schemas (BlockNumberPositiveSchema) require >= 1
  // and 1 is also valid for the relaxed BlockNumberSchema.
  if (paramName && (t === 'number' || t === 'bigint')) {
    const stringify = (n: number) => (t === 'bigint' ? `"${n}"` : String(n));
    if (paramName === 'from' || paramName === 'fromBlock') return stringify(1);
    if (paramName === 'limit') return stringify(100);
    if (paramName === 'page') return stringify(0);
    if (paramName === 'checkpointNumber') return stringify(1);
  }

  if (t === 'number') return '12345';
  if (t === 'bigint') return '"100"';
  if (t === 'string') return '"0x1234..."';
  if (t === 'boolean') return 'true';
  if (t === 'number | "latest"' || t === 'BlockHash | number | "latest"') return '"latest"';
  if (/['"]all['"]|['"]current['"]/.test(t)) return '"current"';
  if (t === 'Fr' || t === 'AztecAddress' || t === 'BlockHash') return '"0x1234..."';
  if (t === 'EthAddress') return '"0x1234..."';
  if (t === 'SlotNumber') return '"100"';
  if (t === 'MerkleTreeId') return '1';
  if (t === 'ManaUsageEstimate') return '"target"';
  if (t.endsWith('[]')) return `[${generateExampleParam(t.slice(0, -2), paramName)}]`;
  if (t === 'Tx') return '{"data":"0x..."}';
  if (t === 'TxHash') return '"0x1234..."';
  if (t === 'SiloedTag') return '"0x1234..."';
  if (t === 'Tag') return '"0x1234..."';
  if (t === 'LogFilter') return '{"fromBlock":100,"toBlock":200}';
  if (t === 'object') return '{}';
  return '"0x1234..."';
}

function generateMethodMarkdown(method: MethodInfo, isAdmin: boolean): string {
  const lines: string[] = [];
  const rpcName = `${method.namespace}_${method.name}`;
  const port = isAdmin ? 8880 : 8080;

  lines.push(`### ${rpcName}`);
  lines.push('');

  if (method.jsdoc.description) {
    lines.push(method.jsdoc.description);
    lines.push('');
  }

  if (method.jsdoc.deprecated) {
    lines.push(`**Deprecated**: ${method.jsdoc.deprecated}`);
    lines.push('');
  }

  if (method.jsdoc.remarks) {
    lines.push(`**Remarks**: ${method.jsdoc.remarks}`);
    lines.push('');
  }

  // Parameters
  if (method.paramTypes.length === 0) {
    lines.push('**Parameters**: None');
  } else {
    lines.push('**Parameters**:');
    lines.push('');
    for (let i = 0; i < method.paramTypes.length; i++) {
      const paramName = method.paramNames[i] || `param${i + 1}`;
      const paramType = method.paramTypes[i];
      const jsdocParam = method.jsdoc.params.find(p => p.name === paramName);
      const desc = jsdocParam?.description ? ` - ${jsdocParam.description}` : '';
      lines.push(`${i + 1}. \`${paramName}\` - \`${paramType}\`${desc}`);
    }
  }
  lines.push('');

  // Returns
  const returnsDesc = method.jsdoc.returns ? ` - ${method.jsdoc.returns}` : '';
  lines.push(`**Returns**: \`${method.returnType}\`${returnsDesc}`);
  lines.push('');

  // Example
  const exampleParams = method.paramTypes
    .map((t, i) => generateExampleParam(t, method.paramNames[i]))
    .join(',');

  if (isAdmin) {
    lines.push('**Example (CLI)**:');
    lines.push('');
    lines.push('```bash');
    lines.push(`curl -X POST http://localhost:${port} \\`);
    lines.push(`  -H 'Content-Type: application/json' \\`);
    lines.push(`  -d '{"jsonrpc":"2.0","method":"${rpcName}","params":[${exampleParams}],"id":1}'`);
    lines.push('```');
    lines.push('');
    lines.push('**Example (Docker)**:');
    lines.push('');
    lines.push('```bash');
    lines.push(`docker exec -it aztec-node curl -X POST http://localhost:${port} \\`);
    lines.push(`  -H 'Content-Type: application/json' \\`);
    lines.push(`  -d '{"jsonrpc":"2.0","method":"${rpcName}","params":[${exampleParams}],"id":1}'`);
    lines.push('```');
  } else {
    lines.push('**Example**:');
    lines.push('');
    lines.push('```bash');
    lines.push(`curl -X POST http://localhost:${port} \\`);
    lines.push(`  -H 'Content-Type: application/json' \\`);
    lines.push(`  -d '{"jsonrpc":"2.0","method":"${rpcName}","params":[${exampleParams}],"id":1}'`);
    lines.push('```');
  }

  return lines.join('\n');
}

function generateDocument(allMethods: Map<string, MethodInfo>, schemaMethodNames: { node: string[]; nodeAdmin: string[] }): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push('id: node_api_reference');
  lines.push('displayed_sidebar: operatorsSidebar');
  lines.push('title: Node JSON RPC API reference');
  lines.push('description: Complete reference for the Aztec Node JSON RPC API, including block queries, transaction submission, world state access, and administrative operations.');
  lines.push('references: ["yarn-project/stdlib/src/interfaces/aztec-node.ts", "yarn-project/stdlib/src/interfaces/aztec-node-admin.ts"]');
  lines.push('---');
  lines.push('');
  lines.push('<!-- AUTO-GENERATED FILE. DO NOT EDIT MANUALLY. -->');
  lines.push('<!-- Generated by docs/scripts/node_api_reference_generation/generate_node_api_reference.ts -->');
  lines.push('');
  lines.push('This document provides a complete reference for the Aztec Node JSON RPC API. All methods are exposed via JSON RPC on the node\'s configured ports.');
  lines.push('');
  lines.push('## API endpoint');
  lines.push('');
  lines.push('**Public RPC URL**: `http://localhost:8080`');
  lines.push('');
  lines.push('**Admin URL**: `http://localhost:8880`');
  lines.push('');
  lines.push('Note that the above ports are only defaults, and can be modified by setting `--port` and `--admin-port` flags upon startup.');
  lines.push('');
  lines.push('All methods use standard JSON RPC 2.0 format with methods prefixed by `node_` or `nodeAdmin_`.');
  lines.push('');

  const rendered = new Set<string>();

  for (const group of METHOD_GROUPS) {
    const isAdmin = group.namespace === 'nodeAdmin';

    const groupMethods: MethodInfo[] = [];
    for (const methodName of group.methods) {
      const key = `${group.namespace}:${methodName}`;
      const info = allMethods.get(key);
      if (info) {
        groupMethods.push(info);
        rendered.add(key);
      }
    }

    if (groupMethods.length === 0) continue;

    if (isAdmin) {
      lines.push('## Admin API');
      lines.push('');
      lines.push('Administrative operations are exposed on port 8880 under the `nodeAdmin_` namespace.');
      lines.push('');
      lines.push(':::warning Security: Admin API Access');
      lines.push('For security reasons, the admin port (8880) should **not be exposed** to the host machine in Docker deployments. The examples below show both CLI and Docker methods:');
      lines.push('');
      lines.push('**CLI Method** (when running with `aztec start` directly):');
      lines.push('');
      lines.push('```bash');
      lines.push('curl -X POST http://localhost:8880 ...');
      lines.push('```');
      lines.push('');
      lines.push('**Docker Method** (when running with Docker Compose):');
      lines.push('');
      lines.push('```bash');
      lines.push('docker exec -it <container-name> curl -X POST http://localhost:8880 ...');
      lines.push('```');
      lines.push('');
      lines.push('Replace `<container-name>` with your container name (e.g., `aztec-node`, `aztec-sequencer`, `prover-node`).');
      lines.push(':::');
      lines.push('');
    } else {
      lines.push(`## ${group.heading}`);
      lines.push('');
    }

    for (const method of groupMethods) {
      lines.push(generateMethodMarkdown(method, isAdmin));
      lines.push('');
    }
  }

  // Ungrouped methods
  const allSchemaKeys = [
    ...schemaMethodNames.node.map(m => `node:${m}`),
    ...schemaMethodNames.nodeAdmin.map(m => `nodeAdmin:${m}`),
  ];
  const ungrouped = allSchemaKeys.filter(k => !rendered.has(k));
  if (ungrouped.length > 0) {
    lines.push('## Other methods');
    lines.push('');
    lines.push('<!-- WARNING: The following methods are not yet categorized in METHOD_GROUPS. -->');
    lines.push('<!-- Update generate_node_api_reference.ts to place them in the correct section. -->');
    lines.push('');
    for (const key of ungrouped) {
      const info = allMethods.get(key);
      if (info) {
        const isAdmin = key.startsWith('nodeAdmin:');
        lines.push(generateMethodMarkdown(info, isAdmin));
        lines.push('');
      }
    }
  }

  // Next steps
  lines.push('## Next steps');
  lines.push('');
  lines.push('- [How to Run a Sequencer Node](../setup/sequencer-setup.md) - Set up a node');
  lines.push('- [Ethereum RPC Calls Reference](./ethereum-rpc-reference.md) - L1 RPC usage');
  lines.push('- [CLI Reference](./cli-reference.md) - Command-line options');
  lines.push('- [Aztec Discord](https://discord.gg/aztec) - Developer support');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { yarnProject, output } = parseArgs();

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
      console.warn(`WARNING: node_${name} is missing JSDoc — rendered without description`);
    }
    const paramNames = mergedParamNames.get(name) || [];

    allMethods.set(`node:${name}`, {
      name,
      namespace: 'node',
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
      console.warn(`WARNING: nodeAdmin_${name} is missing JSDoc — rendered without description`);
    }
    const paramNames = adminInterface.paramNames.get(name) || [];

    allMethods.set(`nodeAdmin:${name}`, {
      name,
      namespace: 'nodeAdmin',
      jsdoc,
      paramTypes: schema.paramTypes,
      paramNames: paramNames.length > 0 ? paramNames : schema.paramTypes.map((_, i) => `param${i + 1}`),
      returnType: schema.returnType,
    });
  }

  const markdown = generateDocument(allMethods, { node: nodeMethodNames, nodeAdmin: adminMethodNames });
  fs.writeFileSync(output, markdown, 'utf-8');
  console.log(`Written to ${output}`);

  // Report ungrouped methods
  const allGrouped = new Set<string>();
  for (const group of METHOD_GROUPS) {
    for (const m of group.methods) allGrouped.add(`${group.namespace}:${m}`);
  }
  const allKeys = [
    ...nodeMethodNames.map(m => `node:${m}`),
    ...adminMethodNames.map(m => `nodeAdmin:${m}`),
  ];
  const ungrouped = allKeys.filter(k => !allGrouped.has(k));
  if (ungrouped.length > 0) {
    console.warn(`\nWARNING: ${ungrouped.length} ungrouped method(s) (rendered in "Other methods"):`);
    for (const k of ungrouped) console.warn(`  - ${k.replace(':', '_')}`);
    console.warn('Update METHOD_GROUPS in generate_node_api_reference.ts to categorize them.');
  }

  // Report methods in config but missing from schema
  for (const group of METHOD_GROUPS) {
    for (const m of group.methods) {
      if (!allMethods.has(`${group.namespace}:${m}`)) {
        console.warn(`WARNING: ${group.namespace}_${m} is in METHOD_GROUPS but not in schema`);
      }
    }
  }

  console.log(`\nTotal: ${nodeMethodNames.length} node_ + ${adminMethodNames.length} nodeAdmin_ = ${nodeMethodNames.length + adminMethodNames.length} methods`);
}

main();
