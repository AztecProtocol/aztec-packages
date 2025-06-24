import { VK_TREE_HEIGHT } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { createConsoleLogger } from '@aztec/foundation/log';
import { MerkleTreeCalculator } from '@aztec/foundation/trees';
import { fileURLToPath } from '@aztec/foundation/url';

import { promises as fs } from 'fs';

import type { ProtocolArtifact } from '../artifacts/types.js';
import { ProtocolCircuitVkIndexes, ProtocolCircuitVks } from '../entrypoint/server/vks.js';

const log = createConsoleLogger('autogenerate');

function resolveRelativePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url).href);
}

async function buildVKTree() {
  const calculator = await MerkleTreeCalculator.create(VK_TREE_HEIGHT, Buffer.alloc(32), async (a, b) =>
    (await poseidon2Hash([a, b])).toBuffer(),
  );

  const vkHashes = new Array(2 ** VK_TREE_HEIGHT).fill(Buffer.alloc(32));
  for (const [key, value] of Object.entries(ProtocolCircuitVks)) {
    const index = ProtocolCircuitVkIndexes[key as ProtocolArtifact];
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
