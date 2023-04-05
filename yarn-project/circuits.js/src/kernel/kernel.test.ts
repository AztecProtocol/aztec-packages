import times from 'lodash.times';
import { FUNCTION_TREE_HEIGHT, computeFunctionTreeRoot } from '../index.js';
import { fr } from '../tests/factories.js';
import { Fr } from '@aztec/foundation';
import { CircuitsWasm } from '../wasm/circuits_wasm.js';
import { computeFunctionTree, getDummyPreviousKernelData } from './kernel.js';

describe('abis wasm bindings', () => {
  let wasm: CircuitsWasm;

  beforeAll(async () => {
    wasm = await CircuitsWasm.new();
  });

  it('gets dummy kernel data', async () => {
    await expect(getDummyPreviousKernelData(wasm)).resolves.toBeDefined();
  });

  it('computes function tree', async () => {
    const numLeaves = 4;

    const leaves = times(numLeaves, i => fr(i).toBuffer());
    const tree = await computeFunctionTree(wasm, leaves);

    expect(tree).toHaveLength(2 ** (FUNCTION_TREE_HEIGHT + 1) - 1);

    const root = tree[tree.length - 1];
    expect(root).toEqual(Fr.fromBuffer(await computeFunctionTreeRoot(wasm, leaves)));
  });
});
