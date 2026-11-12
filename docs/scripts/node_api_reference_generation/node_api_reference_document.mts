/**
 * Renders the Node JSON-RPC API reference markdown from the methods the generator extracted.
 *
 * Imports nothing, so the docs checks can test it without an install.
 */

export interface MethodJSDoc {
  description: string;
  params: { name: string; description: string }[];
  returns: string;
  deprecated?: string;
  remarks?: string;
}

export interface MethodInfo {
  name: string;
  namespace: string;
  jsdoc: MethodJSDoc;
  paramNames: string[];
  paramTypes: string[];
  returnType: string;
}

/** Method grouping configuration. Methods are rendered in this order. */
export const METHOD_GROUPS: { heading: string; namespace: string; methods: string[] }[] = [
  {
    heading: 'Block queries',
    namespace: 'aztec',
    methods: [
      'getBlockNumber',
      'getCheckpointNumber',
      'getChainTips',
      'getL1Constants',
      'getSyncedL2SlotNumber',
      'getSyncedL2EpochNumber',
      'getSyncedL1Timestamp',
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
    namespace: 'aztec',
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
    namespace: 'aztec',
    methods: ['getPublicStorageAt', 'getWorldStateSyncStatus'],
  },
  {
    heading: 'Membership witnesses',
    namespace: 'aztec',
    methods: [
      'findLeavesIndexes',
      'getNullifierMembershipWitness',
      'getLowNullifierMembershipWitness',
      'getPublicDataWitness',
      'getBlockHashMembershipWitness',
      'getBlockHashMembershipWitnessAtArchive',
      'getNoteHashMembershipWitness',
      'getTxEffectMembershipWitness',
    ],
  },
  {
    heading: 'L1 to L2 messages',
    namespace: 'aztec',
    methods: [
      'getL1ToL2MessageMembershipWitness',
      'getL1ToL2MessageIndex',
      'getL2ToL1MembershipWitness',
      'getL2ToL1Messages',
    ],
  },
  {
    heading: 'Log queries',
    namespace: 'aztec',
    methods: ['getPrivateLogsByTags', 'getPublicLogsByTags'],
  },
  {
    heading: 'Contract queries',
    namespace: 'aztec',
    methods: ['getContractClass', 'getContract'],
  },
  {
    heading: 'Fee queries',
    namespace: 'aztec',
    methods: ['getCurrentMinFees', 'getPredictedMinFees', 'getMaxPriorityFees'],
  },
  {
    heading: 'Node information',
    namespace: 'aztec',
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
    namespace: 'aztec',
    methods: ['getValidatorsStats', 'getValidatorStats', 'getValidatorStatsBatch'],
  },
  {
    heading: 'P2P queries',
    namespace: 'aztec',
    methods: ['getPeers', 'getCheckpointAttestationsForSlot', 'getProposalsForSlot'],
  },
  {
    heading: 'Debug operations',
    namespace: 'aztec',
    methods: ['getAllowedPublicSetup'],
  },
  {
    heading: 'Admin API',
    namespace: 'aztecAdmin',
    methods: [
      'getConfig',
      'setConfig',
      'pauseSync',
      'resumeSync',
      'pauseSequencer',
      'resumeSequencer',
      'rollbackTo',
      'startSnapshotUpload',
      'getSlashOffenses',
      'reloadKeystore',
    ],
  },
];

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: baselined 2026-11-12: predates the complexity budget
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
  if (t === '{ archive: Fr }') return '{"archive":"0x1234..."}';
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

const ADMIN_API_KEY_HEADER = 'x-api-key: [ADMIN_API_KEY]';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: baselined 2026-11-12: predates the complexity budget
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

  const headers = ['Content-Type: application/json', ...(isAdmin ? [ADMIN_API_KEY_HEADER] : [])];
  const curl = (prefix = '') => [
    '```bash',
    `${prefix}curl -X POST http://localhost:${port} \\`,
    ...headers.map((header) => `  -H '${header}' \\`),
    `  -d '{"jsonrpc":"2.0","method":"${rpcName}","params":[${exampleParams}],"id":1}'`,
    '```',
  ];
  if (isAdmin) {
    lines.push('**Example (CLI)**:', '', ...curl(), '', '**Example (Docker)**:', '', ...curl('docker exec -it aztec-node '));
  } else {
    lines.push('**Example**:', '', ...curl());
  }

  return lines.join('\n');
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: baselined 2026-11-12: predates the complexity budget
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: baselined 2026-11-12: predates the function length budget
export function generateDocument(allMethods: Map<string, MethodInfo>, schemaMethodNames: { aztec: string[]; aztecAdmin: string[] }): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push('id: node_api_reference');
  lines.push('displayed_sidebar: operatorsSidebar');
  lines.push('title: Node JSON RPC API reference');
  lines.push('description: Complete reference for the Aztec Node JSON RPC API, including block queries, transaction submission, world state access, and administrative operations.');
  lines.push('references: ["labs/yarn-project/stdlib/src/interfaces/aztec-node.ts", "labs/yarn-project/stdlib/src/interfaces/aztec-node-admin.ts"]');
  lines.push('---');
  lines.push('');
  lines.push('<!-- AUTO-GENERATED FILE. DO NOT EDIT MANUALLY. -->');
  lines.push('<!-- Generated by docs/scripts/node_api_reference_generation/generate_node_api_reference.mts -->');
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
  lines.push('All methods use standard JSON RPC 2.0 format with methods prefixed by `aztec_` or `aztecAdmin_`.');
  lines.push('');

  const rendered = new Set<string>();

  for (const group of METHOD_GROUPS) {
    const isAdmin = group.namespace === 'aztecAdmin';

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
      lines.push('Administrative operations are exposed on port 8880 under the `aztecAdmin_` namespace.');
      lines.push('');
      lines.push('The admin API requires an API key by default. The node generates one at first startup and prints it once to the logs; pass it with the `x-api-key` header, as the examples below do, or as `Authorization: Bearer [ADMIN_API_KEY]`. See [admin API key authentication](./changelog/v4.md#admin-api-key-authentication).');
      lines.push('');
      lines.push(':::warning Security: Admin API Access');
      lines.push('For security reasons, the admin port (8880) should **not be exposed** to the host machine in Docker deployments. The examples below show both CLI and Docker methods:');
      lines.push('');
      lines.push('**CLI Method** (when running with `aztec start` directly):');
      lines.push('');
      lines.push('```bash');
      lines.push(`curl -X POST http://localhost:8880 -H '${ADMIN_API_KEY_HEADER}' ...`);
      lines.push('```');
      lines.push('');
      lines.push('**Docker Method** (when running with Docker Compose):');
      lines.push('');
      lines.push('```bash');
      lines.push(`docker exec -it <container-name> curl -X POST http://localhost:8880 -H '${ADMIN_API_KEY_HEADER}' ...`);
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
    ...schemaMethodNames.aztec.map((m) => `aztec:${m}`),
    ...schemaMethodNames.aztecAdmin.map((m) => `aztecAdmin:${m}`),
  ];
  const ungrouped = allSchemaKeys.filter((k) => !rendered.has(k));
  if (ungrouped.length > 0) {
    lines.push('## Other methods');
    lines.push('');
    lines.push('<!-- WARNING: The following methods are not yet categorized in METHOD_GROUPS. -->');
    lines.push('<!-- Update METHOD_GROUPS in node_api_reference_document.mts to place them in the correct section. -->');
    lines.push('');
    for (const key of ungrouped) {
      const info = allMethods.get(key);
      if (info) {
        const isAdmin = key.startsWith('aztecAdmin:');
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
