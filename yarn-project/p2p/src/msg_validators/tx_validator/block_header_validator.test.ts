import { Fr } from '@aztec/foundation/fields';
import { mockTxForRollup } from '@aztec/stdlib/testing';
import { type AnyTx, TX_ERROR_BLOCK_HEADER, type TxValidationResult } from '@aztec/stdlib/tx';

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
    badTx.data.constants.historicalHeader.globalVariables.blockNumber += 1;

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
      reason: [TX_ERROR_BLOCK_HEADER],
    } satisfies TxValidationResult);
  });
});
