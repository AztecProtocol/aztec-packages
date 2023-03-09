import nodeCrypto from 'crypto';
import { AppendOnlyTreeSnapshot, ContractData, RollupBlockData } from './rollup_block_data.js';

export const randomBytes = (len: number) => {
  return nodeCrypto.randomBytes(len) as Buffer;
};

export const randomAppendOnlyTreeSnapshot = (nextIndex: number): AppendOnlyTreeSnapshot => {
  return {
    root: randomBytes(32),
    nextAvailableLeafIndex: nextIndex,
  };
};

export const randomContractData = (): ContractData => {
  return {
    aztecAddress: randomBytes(32),
    ethAddress: randomBytes(20),
  };
};

describe('RollupProofData', () => {
  it('can encode a rollup proof data object to buffer and back', () => {
    const newNullifiers = [randomBytes(32), randomBytes(32), randomBytes(32), randomBytes(32)];
    const newCommitments = [randomBytes(32), randomBytes(32), randomBytes(32), randomBytes(32)];
    const newContracts: Buffer[] = [randomBytes(32)];
    const newContractsData: ContractData[] = [randomContractData()];

    const rollupProofData = new RollupBlockData(
      0,
      randomAppendOnlyTreeSnapshot(0),
      randomAppendOnlyTreeSnapshot(0),
      randomAppendOnlyTreeSnapshot(0),
      randomAppendOnlyTreeSnapshot(0),
      randomAppendOnlyTreeSnapshot(0),
      randomAppendOnlyTreeSnapshot(newCommitments.length),
      randomAppendOnlyTreeSnapshot(newNullifiers.length),
      randomAppendOnlyTreeSnapshot(newContracts.length),
      randomAppendOnlyTreeSnapshot(1),
      randomAppendOnlyTreeSnapshot(1),
      newCommitments,
      newNullifiers,
      newContracts,
      newContractsData,
    );

    const buffer = rollupProofData.encode();
    const recovered = RollupBlockData.decode(buffer);

    expect(recovered).toEqual(rollupProofData);
  });
});
