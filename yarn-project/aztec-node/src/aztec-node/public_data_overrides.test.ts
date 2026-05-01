import { Fr } from '@aztec/foundation/curves/bn254';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import { type MockProxy, mock } from 'jest-mock-extended';

import { applyPublicDataOverrides } from './public_data_overrides.js';

describe('applyPublicDataOverrides', () => {
  let fork: MockProxy<MerkleTreeWriteOperations>;

  beforeEach(() => {
    fork = mock<MerkleTreeWriteOperations>();
    fork.sequentialInsert.mockResolvedValue({ lowLeavesWitnesses: [], insertionWitnesses: [] } as any);
  });

  it('does nothing when overrides is undefined', async () => {
    await applyPublicDataOverrides(fork, undefined);
    expect(fork.sequentialInsert).not.toHaveBeenCalled();
  });

  it('does nothing when overrides is empty', async () => {
    await applyPublicDataOverrides(fork, []);
    expect(fork.sequentialInsert).not.toHaveBeenCalled();
  });

  it('inserts a single override at the correct leaf slot', async () => {
    const contract = await AztecAddress.random();
    const slot = Fr.random();
    const value = Fr.random();

    await applyPublicDataOverrides(fork, [{ contract, slot, value }]);

    const expectedLeafSlot = await computePublicDataTreeLeafSlot(contract, slot);
    const expectedWrite = new PublicDataWrite(expectedLeafSlot, value);

    expect(fork.sequentialInsert).toHaveBeenCalledTimes(1);
    expect(fork.sequentialInsert).toHaveBeenCalledWith(MerkleTreeId.PUBLIC_DATA_TREE, [expectedWrite.toBuffer()]);
  });

  it('inserts multiple overrides in a single batch call', async () => {
    const contract = await AztecAddress.random();
    const overrides = [
      { contract, slot: Fr.random(), value: Fr.random() },
      { contract, slot: Fr.random(), value: Fr.random() },
    ];

    await applyPublicDataOverrides(fork, overrides);

    const expectedWrites = await Promise.all(
      overrides.map(async o => {
        const leafSlot = await computePublicDataTreeLeafSlot(o.contract, o.slot);
        return new PublicDataWrite(leafSlot, o.value);
      }),
    );

    expect(fork.sequentialInsert).toHaveBeenCalledTimes(1);
    expect(fork.sequentialInsert).toHaveBeenCalledWith(
      MerkleTreeId.PUBLIC_DATA_TREE,
      expectedWrites.map(w => w.toBuffer()),
    );
  });

  it('passes duplicate (contract, slot) writes through — last write wins via tree semantics', async () => {
    const contract = await AztecAddress.random();
    const slot = Fr.random();
    const firstValue = Fr.random();
    const secondValue = Fr.random();

    await applyPublicDataOverrides(fork, [
      { contract, slot, value: firstValue },
      { contract, slot, value: secondValue },
    ]);

    // Both writes are passed to sequentialInsert; the tree handles last-wins ordering.
    expect(fork.sequentialInsert).toHaveBeenCalledTimes(1);
    const [treeId, leaves] = fork.sequentialInsert.mock.calls[0] as [MerkleTreeId, Buffer[]];
    expect(treeId).toBe(MerkleTreeId.PUBLIC_DATA_TREE);
    expect(leaves).toHaveLength(2);
  });
});
