import { VK_TREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createConsoleLogger } from '@aztec/foundation/log';
import { MerkleTreeCalculator } from '@aztec/foundation/trees';
import { fileURLToPath } from '@aztec/foundation/url';
import { computeMerkleHash } from '@aztec/stdlib/hash';

import { promises as fs } from 'fs';

import type { ProtocolArtifact } from '../artifacts/types.js';
import { ClientCircuitVks } from '../artifacts/vks/client.js';
import { ProtocolCircuitVkIndexes, ServerCircuitVks } from '../artifacts/vks/server.js';

const allVks = { ...ServerCircuitVks, ...ClientCircuitVks };

const log = createConsoleLogger('autogenerate');

function resolveRelativePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url).href);
}

async function buildVKTree() {
  const calculator = await MerkleTreeCalculator.create(
    VK_TREE_HEIGHT,
    Buffer.alloc(32),
    async (a, b) => (await computeMerkleHash(Fr.fromBuffer(a), Fr.fromBuffer(b))).toBuffer() as Buffer<ArrayBuffer>,
  );

  const vkHashes = new Array(2 ** VK_TREE_HEIGHT).fill(Buffer.alloc(32));
  const seen = new Set<number>();
  for (const [key, value] of Object.entries(allVks)) {
    const index = ProtocolCircuitVkIndexes[key as ProtocolArtifact];
    if (index >= vkHashes.length) {
      throw new Error(`VK index ${index} for ${key} is out of bounds (VK tree size: ${vkHashes.length})`);
    }
    if (seen.has(index)) {
      throw new Error(`Duplicate VK index ${index} for ${key}`);
    }
    seen.add(index);
    vkHashes[index] = value.keyAsFields.hash.toBuffer();
  }

  return calculator.computeTree(vkHashes);
}

async function main() {
  const vkTree = await buildVKTree();
  const vkTreePath = resolveRelativePath('../vk_tree.ts');
  const vkTreeFileContents = `
import { MerkleTree } from '@aztec/foundation/trees';

export const vkTree = new MerkleTree(${vkTree.height}, [${vkTree.nodes
    .map(node => `'${node.toString('hex')}'`)
    .join(', ')}
].map(hex => Buffer.from(hex, 'hex')));
`;

  await fs.writeFile(vkTreePath, vkTreeFileContents);
  log(`Wrote vk tree to ${vkTreePath}`);
}

try {
  await main();
} catch (err: unknown) {
  log(`Error generating vk tree ${err}`);
  process.exit(1);
}
