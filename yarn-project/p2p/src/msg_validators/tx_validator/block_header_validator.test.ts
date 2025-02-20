import type { AnyTx, TxValidationResult } from '@aztec/circuit-types';
import { mockTxForRollup } from '@aztec/circuit-types/testing';
import { Fr } from '@aztec/circuits.js';

import { mock, mockFn } from 'jest-mock-extended';
import type { MockProxy } from 'jest-mock-extended';

import { BlockHeaderTxValidator } from './block_header_validator.js';
import type { ArchiveSource } from './block_header_validator.js';

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
