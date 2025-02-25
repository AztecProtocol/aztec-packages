import { mockTxForRollup } from '@aztec/circuits.js/testing';
import { type AnyTx, type TxValidationResult } from '@aztec/circuits.js/tx';
import { Fr } from '@aztec/foundation/fields';

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
    const badTx = await mockTxForRollup();
    badTx.data.constants.historicalHeader.globalVariables.blockNumber =
      badTx.data.constants.historicalHeader.globalVariables.blockNumber.add(new Fr(1));

    const goodTx = await mockTxForRollup();
    archiveSource.getArchiveIndices.mockImplementation(async (archives: Fr[]) => {
      if (archives[0].equals(await goodTx.data.constants.historicalHeader.hash())) {
        return [1n];
      } else {
        return [undefined];
      }
    });
    await expect(txValidator.validateTx(goodTx)).resolves.toEqual({ result: 'valid' } satisfies TxValidationResult);
    await expect(txValidator.validateTx(badTx)).resolves.toEqual({
      result: 'invalid',
      reason: ['Block header not found'],
    } satisfies TxValidationResult);
  });
});
