import { Fr } from '@aztec/foundation/curves/bn254';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';

import { fr, makeSelector } from '../tests/factories.js';
import type { PrivateFunction } from './interfaces/contract_class.js';
import { computePrivateFunctionsRoot, computePrivateFunctionsTree } from './private_function.js';

describe('PrivateFunction', () => {
  setupCustomSnapshotSerializers(expect);
  const privateFunctions: PrivateFunction[] = [
    { selector: makeSelector(1), vkHash: fr(2) },
    { selector: makeSelector(3), vkHash: fr(4) },
  ];

  it('computes merkle tree', async () => {
    const tree = await computePrivateFunctionsTree(privateFunctions);
    expect(tree.nodes.map(node => node.toString())).toMatchSnapshot();
  });

  it('computes merkle tree root', async () => {
    const root = await computePrivateFunctionsRoot(privateFunctions);
    expect(root.toString()).toMatchInlineSnapshot(
      `"0x1816decdf5cec4a1f78ba6d965fc38d7c52dd21664d1b4266603cf767ff5563e"`,
    );
  });

  it('tree and root methods agree', async () => {
    const tree = await computePrivateFunctionsTree(privateFunctions);
    const root = await computePrivateFunctionsRoot(privateFunctions);
    expect(Fr.fromBuffer(tree.root).equals(root)).toBe(true);
  });

  it('sorts functions before computing tree', async () => {
    const root = await computePrivateFunctionsRoot(privateFunctions);
    const rootReversed = await computePrivateFunctionsRoot([...privateFunctions].reverse());
    expect(root.equals(rootReversed)).toBe(true);
  });
});
