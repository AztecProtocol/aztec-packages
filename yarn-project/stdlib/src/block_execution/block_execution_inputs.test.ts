import { SpongeBlob } from '@aztec/blob-lib/types';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import { BlockHeader } from '../tx/block_header.js';
import { TxHash } from '../tx/tx_hash.js';
import { BlockExecutionInputs } from './block_execution_inputs.js';

describe('BlockExecutionInputs', () => {
  it('round-trips through buffer serialization', () => {
    const header = BlockHeader.random();
    const sponge = SpongeBlob.empty();
    const original = new BlockExecutionInputs(
      EpochNumber(7),
      2,
      header,
      [TxHash.random(), TxHash.random()],
      true,
      [Fr.random(), Fr.random()],
      sponge,
    );
    const restored = BlockExecutionInputs.fromBuffer(original.toBuffer());
    expect(restored.epochNumber).toEqual(EpochNumber(7));
    expect(restored.checkpointIndex).toEqual(2);
    expect(restored.blockNumber).toEqual(header.getBlockNumber());
    expect(restored.txHashes).toHaveLength(2);
    expect(restored.txHashes[0].equals(original.txHashes[0])).toBe(true);
    expect(restored.txHashes[1].equals(original.txHashes[1])).toBe(true);
    expect(restored.isFirstBlockInCheckpoint).toBe(true);
    expect(restored.l1ToL2Messages.map(m => m.toString())).toEqual(original.l1ToL2Messages.map(m => m.toString()));
  });

  it('round-trips through hex string', () => {
    const header = BlockHeader.random();
    const original = new BlockExecutionInputs(
      EpochNumber(0),
      0,
      header,
      [TxHash.random()],
      false,
      [],
      SpongeBlob.empty(),
    );
    const restored = BlockExecutionInputs.fromString(original.toString());
    expect(restored.toBuffer().equals(original.toBuffer())).toBe(true);
  });

  it('handles an empty tx list', () => {
    const header = BlockHeader.random();
    const original = new BlockExecutionInputs(EpochNumber(3), 1, header, [], false, [], SpongeBlob.empty());
    const restored = BlockExecutionInputs.fromBuffer(original.toBuffer());
    expect(restored.txHashes).toEqual([]);
  });
});
