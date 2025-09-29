import { jsonStringify } from '@aztec/foundation/json-rpc';

import { makeBlockRootFirstRollupPrivateInputs, makeBlockRootSingleTxRollupPrivateInputs } from '../tests/factories.js';
import {
  BlockRootFirstRollupPrivateInputs,
  BlockRootSingleTxRollupPrivateInputs,
} from './block_root_rollup_private_inputs.js';

describe('BlockRootFirstRollupPrivateInputs', () => {
  it('serializes a BlockRootFirstRollupPrivateInputs to buffer and deserializes it back', () => {
    const expected = makeBlockRootFirstRollupPrivateInputs();
    const buffer = expected.toBuffer();
    const res = BlockRootFirstRollupPrivateInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it('serializes to json and deserializes it back', () => {
    const expected = makeBlockRootFirstRollupPrivateInputs();
    const json = jsonStringify(expected);
    expect(BlockRootFirstRollupPrivateInputs.schema.parse(JSON.parse(json))).toEqual(expected);
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
