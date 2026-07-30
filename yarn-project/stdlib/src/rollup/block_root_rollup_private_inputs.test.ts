import { jsonStringify } from '@aztec/foundation/json-rpc';

import { makeBlockRootRollupPrivateInputs, makeBlockRootSingleTxRollupPrivateInputs } from '../tests/factories.js';
import {
  BlockRootRollupPrivateInputs,
  BlockRootSingleTxRollupPrivateInputs,
} from './block_root_rollup_private_inputs.js';

describe('BlockRootRollupPrivateInputs', () => {
  it('serializes a BlockRootRollupPrivateInputs to buffer and deserializes it back', () => {
    const expected = makeBlockRootRollupPrivateInputs();
    const buffer = expected.toBuffer();
    const res = BlockRootRollupPrivateInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it('serializes to json and deserializes it back', () => {
    const expected = makeBlockRootRollupPrivateInputs();
    const json = jsonStringify(expected);
    expect(BlockRootRollupPrivateInputs.schema.parse(JSON.parse(json))).toEqual(expected);
  });
});

describe('BlockRootSingleTxRollupPrivateInputs', () => {
  it('serializes a BlockRootSingleTxRollupPrivateInputs to buffer and deserializes it back', () => {
    const expected = makeBlockRootSingleTxRollupPrivateInputs();
    const buffer = expected.toBuffer();
    const res = BlockRootSingleTxRollupPrivateInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it('serializes to json and deserializes it back', () => {
    const expected = makeBlockRootSingleTxRollupPrivateInputs();
    const json = jsonStringify(expected);
    expect(BlockRootSingleTxRollupPrivateInputs.schema.parse(JSON.parse(json))).toEqual(expected);
  });
});
