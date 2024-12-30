import { type AnyTx, mockTxForRollup } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';

import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { type ArchiveSource, BlockHeaderTxValidator } from './block_header_validator.js';

describe('BlockHeaderTxValidator', () => {
  let txValidator: BlockHeaderTxValidator<AnyTx>;
  let archiveSource: MockProxy<ArchiveSource>;

  beforeEach(() => {
    archiveSource = mock<ArchiveSource>({
      getArchiveIndices: mockFn().mockImplementation(() => {
        return Promise.resolve([undefined]);
      }),
    });
    txValidator = new BlockHeaderTxValidator(archiveSource);
  });

  it('rejects tx with invalid block header', async () => {
    const badTx = mockTxForRollup();
    badTx.data.constants.historicalHeader.globalVariables.blockNumber =
      badTx.data.constants.historicalHeader.globalVariables.blockNumber.add(new Fr(1));

    const goodTx = mockTxForRollup();
    archiveSource.getArchiveIndices.mockImplementation((archives: Fr[]) => {
      if (archives[0].equals(goodTx.data.constants.historicalHeader.hash())) {
        return Promise.resolve([1n]);
      } else {
        return Promise.resolve([undefined]);
      }
    });
    await expect(txValidator.validateTxs([goodTx, badTx])).resolves.toEqual([[goodTx], [badTx]]);
  });
});
